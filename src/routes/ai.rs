use std::{
    collections::{HashMap, VecDeque},
    env, fs,
    sync::Mutex,
    time::{Duration, Instant},
};

use actix_web::{
    post,
    web::{self, Data},
    HttpRequest, HttpResponse, Responder,
};
use bytes::Bytes;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;

use crate::routes::mcp::{
    bearer_hash, delete_project_file_for_user, list_project_files_for_user,
    move_project_file_for_user, project_snapshot_for_user, project_summaries_for_user,
    read_project_file_for_user, run_project_command_for_user, upsert_project_file_for_user,
    McpState,
};

const OPENROUTER_MODEL: &str = "deepseek/deepseek-v4-flash";
const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const USER_REQUESTS_PER_HOUR: usize = 30;
const GLOBAL_REQUESTS_PER_HOUR: usize = 300;
const RATE_WINDOW: Duration = Duration::from_secs(60 * 60);
const MAX_MODEL_TURNS: usize = 6;
const MAX_TOOL_CALLS: usize = 12;
const MAX_USER_MESSAGE_BYTES: usize = 12 * 1024;
const CONTEXT_PATH: &str = "ai-context.md";

#[derive(Default)]
pub struct AiState {
    limiter: Mutex<RateLimiter>,
}

#[derive(Default)]
struct RateLimiter {
    user_requests: HashMap<String, VecDeque<Instant>>,
    global_requests: VecDeque<Instant>,
}

struct RateLimitError {
    retry_after_secs: u64,
}

impl RateLimiter {
    fn check(&mut self, user_key: &str, now: Instant) -> Result<(), RateLimitError> {
        prune_old(&mut self.global_requests, now);
        let user_window = self.user_requests.entry(user_key.to_string()).or_default();
        prune_old(user_window, now);

        if self.global_requests.len() >= GLOBAL_REQUESTS_PER_HOUR {
            return Err(RateLimitError {
                retry_after_secs: retry_after(&self.global_requests, now),
            });
        }
        if user_window.len() >= USER_REQUESTS_PER_HOUR {
            return Err(RateLimitError {
                retry_after_secs: retry_after(user_window, now),
            });
        }

        self.global_requests.push_back(now);
        user_window.push_back(now);
        self.user_requests
            .retain(|_, requests| !requests.is_empty());
        Ok(())
    }
}

fn prune_old(requests: &mut VecDeque<Instant>, now: Instant) {
    while requests
        .front()
        .is_some_and(|oldest| now.duration_since(*oldest) >= RATE_WINDOW)
    {
        requests.pop_front();
    }
}

fn retry_after(requests: &VecDeque<Instant>, now: Instant) -> u64 {
    requests
        .front()
        .map(|oldest| {
            RATE_WINDOW
                .saturating_sub(now.duration_since(*oldest))
                .as_secs()
                .max(1)
        })
        .unwrap_or(1)
}

#[derive(Deserialize)]
pub struct AssistantRequest {
    pub session_id: String,
    pub active_workspace_id: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ToolCall {
    id: String,
    #[serde(rename = "type")]
    tool_type: String,
    function: ToolCallFunction,
}

#[derive(Serialize, Deserialize, Clone)]
struct ToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
}

#[derive(Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMessage,
}

#[derive(Deserialize)]
struct OpenRouterMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

#[post("/api/ai/assistant")]
pub async fn assistant(
    req: HttpRequest,
    mcp_state: Data<McpState>,
    ai_state: Data<AiState>,
    body: web::Json<AssistantRequest>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let message = body.message.trim().to_string();
    if message.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "Message is required" }));
    }
    if message.len() > MAX_USER_MESSAGE_BYTES {
        return HttpResponse::BadRequest().json(json!({ "error": "Message is too large" }));
    }
    if body.session_id.trim().len() < 8 {
        return HttpResponse::BadRequest().json(json!({ "error": "session_id is required" }));
    }
    if body.active_workspace_id.trim().is_empty() {
        return HttpResponse::BadRequest()
            .json(json!({ "error": "active_workspace_id is required" }));
    }

    let api_key = match env::var("OPENROUTER_API_KEY") {
        Ok(key) if !key.trim().is_empty() => key,
        _ => {
            return HttpResponse::InternalServerError()
                .json(json!({ "error": "OPENROUTER_API_KEY is not configured" }))
        }
    };

    let rate_key = format!("{}:{}", client_identity(&req), user_key);
    let limit_result = {
        let mut limiter = match ai_state.limiter.lock() {
            Ok(limiter) => limiter,
            Err(_) => {
                return HttpResponse::InternalServerError()
                    .json(json!({ "error": "AI rate limiter lock failed" }))
            }
        };
        limiter.check(&rate_key, Instant::now())
    };
    if let Err(error) = limit_result {
        return HttpResponse::TooManyRequests()
            .insert_header(("Retry-After", error.retry_after_secs.to_string()))
            .json(json!({
                "error": "AI request rate limit exceeded",
                "retryAfterSeconds": error.retry_after_secs
            }));
    }

    let active_workspace_id = body.active_workspace_id.trim().to_string();
    if let Err(error) = project_snapshot_for_user(&mcp_state, &user_key, &active_workspace_id) {
        return HttpResponse::NotFound().json(json!({ "error": error }));
    }

    let (tx, rx) = mpsc::unbounded_channel::<Bytes>();
    let api_origin = public_origin(&req);
    tokio::spawn(async move {
        run_assistant_task(
            tx,
            mcp_state,
            user_key,
            active_workspace_id,
            message,
            api_key,
            api_origin,
        )
        .await;
    });

    let stream = UnboundedReceiverStream::new(rx).map(Ok::<Bytes, actix_web::Error>);
    HttpResponse::Ok()
        .content_type("application/x-ndjson; charset=utf-8")
        .streaming(stream)
}

async fn run_assistant_task(
    tx: mpsc::UnboundedSender<Bytes>,
    mcp_state: Data<McpState>,
    user_key: String,
    active_workspace_id: String,
    user_message: String,
    api_key: String,
    api_origin: String,
) {
    send_event(
        &tx,
        "status",
        json!({ "message": "Preparing workspace context" }),
    );
    let project = match project_snapshot_for_user(&mcp_state, &user_key, &active_workspace_id) {
        Ok(project) => project,
        Err(error) => {
            send_event(&tx, "error", json!({ "message": error }));
            return;
        }
    };
    let system_prompt = build_system_prompt(&project.name, &project.id, project.files.keys());
    let mut messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: Some(system_prompt),
            tool_call_id: None,
            tool_calls: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: Some(user_message),
            tool_call_id: None,
            tool_calls: None,
        },
    ];
    let client = reqwest::Client::new();
    let mut tool_calls_used = 0usize;

    for _turn in 0..MAX_MODEL_TURNS {
        send_event(
            &tx,
            "status",
            json!({ "message": "Thinking with OpenRouter" }),
        );
        let response = match call_openrouter(&client, &api_key, &api_origin, &messages).await {
            Ok(response) => response,
            Err(error) => {
                send_event(&tx, "error", json!({ "message": error }));
                return;
            }
        };
        let Some(choice) = response.choices.into_iter().next() else {
            send_event(
                &tx,
                "error",
                json!({ "message": "OpenRouter returned no choices" }),
            );
            return;
        };
        let content = choice.message.content.unwrap_or_default();
        let tool_calls = choice.message.tool_calls.unwrap_or_default();
        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: if content.is_empty() {
                None
            } else {
                Some(content.clone())
            },
            tool_call_id: None,
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls.clone())
            },
        });

        if tool_calls.is_empty() {
            send_event(&tx, "assistant_message", json!({ "message": content }));
            send_event(&tx, "complete", json!({ "message": "Done" }));
            return;
        }

        for tool_call in tool_calls {
            tool_calls_used = tool_calls_used.saturating_add(1);
            if tool_calls_used > MAX_TOOL_CALLS {
                send_event(
                    &tx,
                    "error",
                    json!({ "message": "Tool call limit exceeded" }),
                );
                return;
            }
            let tool_name = tool_call.function.name.clone();
            send_event(&tx, "tool_start", json!({ "name": tool_name }));
            let tool_result = execute_tool_call(
                &mcp_state,
                &user_key,
                &active_workspace_id,
                &tool_call.function.name,
                &tool_call.function.arguments,
            )
            .await;
            let content = match tool_result {
                Ok(value) => {
                    send_event(&tx, "tool_result", json!({ "name": tool_name, "ok": true }));
                    serde_json::to_string(&value).unwrap_or_else(|_| {
                        "{\"ok\":false,\"error\":\"serialization failed\"}".to_string()
                    })
                }
                Err(error) => {
                    send_event(
                        &tx,
                        "tool_result",
                        json!({ "name": tool_name, "ok": false, "message": error }),
                    );
                    json!({ "ok": false, "error": error }).to_string()
                }
            };
            messages.push(ChatMessage {
                role: "tool".to_string(),
                content: Some(content),
                tool_call_id: Some(tool_call.id),
                tool_calls: None,
            });
        }
    }

    send_event(
        &tx,
        "error",
        json!({ "message": "Assistant reached the model turn limit before finishing" }),
    );
}

async fn call_openrouter(
    client: &reqwest::Client,
    api_key: &str,
    api_origin: &str,
    messages: &[ChatMessage],
) -> Result<OpenRouterResponse, String> {
    let body = json!({
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "tools": tool_definitions(),
        "tool_choice": "auto",
        "temperature": 0.2
    });
    let response = client
        .post(OPENROUTER_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", api_origin)
        .header("X-Title", "SoroPG AI Assistant")
        .body(body.to_string())
        .send()
        .await
        .map_err(|error| format!("OpenRouter request failed: {}", error))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("OpenRouter response read failed: {}", error))?;
    if !status.is_success() {
        return Err(format!("OpenRouter returned {}: {}", status, text));
    }
    serde_json::from_str(&text)
        .map_err(|error| format!("OpenRouter response parse failed: {}", error))
}

async fn execute_tool_call(
    state: &Data<McpState>,
    user_key: &str,
    active_project_id: &str,
    name: &str,
    raw_arguments: &str,
) -> Result<Value, String> {
    let args: Value = if raw_arguments.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(raw_arguments)
            .map_err(|error| format!("Tool arguments were not valid JSON: {}", error))?
    };
    let project_id = args
        .get("projectId")
        .and_then(Value::as_str)
        .unwrap_or(active_project_id);

    match name {
        "soropg_list_projects" => {
            serde_json::to_value(project_summaries_for_user(state, user_key)?)
                .map_err(|error| error.to_string())
        }
        "soropg_get_project" => {
            serde_json::to_value(project_snapshot_for_user(state, user_key, project_id)?)
                .map_err(|error| error.to_string())
        }
        "soropg_list_files" => {
            serde_json::to_value(list_project_files_for_user(state, user_key, project_id)?)
                .map_err(|error| error.to_string())
        }
        "soropg_read_file" => {
            let path = required_str(&args, "path")?;
            serde_json::to_value(read_project_file_for_user(
                state, user_key, project_id, path,
            )?)
            .map_err(|error| error.to_string())
        }
        "soropg_create_file" => {
            let path = required_str(&args, "path")?;
            let content = required_str(&args, "content")?;
            serde_json::to_value(upsert_project_file_for_user(
                state, user_key, project_id, path, content, "create",
            )?)
            .map_err(|error| error.to_string())
        }
        "soropg_replace_file" => {
            let path = required_str(&args, "path")?;
            let content = required_str(&args, "content")?;
            serde_json::to_value(upsert_project_file_for_user(
                state, user_key, project_id, path, content, "replace",
            )?)
            .map_err(|error| error.to_string())
        }
        "soropg_delete_file" => {
            let path = required_str(&args, "path")?;
            serde_json::to_value(delete_project_file_for_user(
                state, user_key, project_id, path,
            )?)
            .map_err(|error| error.to_string())
        }
        "soropg_move_file" => {
            let from_path = required_str(&args, "fromPath")?;
            let to_path = required_str(&args, "toPath")?;
            serde_json::to_value(move_project_file_for_user(
                state, user_key, project_id, from_path, to_path,
            )?)
            .map_err(|error| error.to_string())
        }
        "soropg_run_command" => {
            let command = required_str(&args, "command")?;
            serde_json::to_value(
                run_project_command_for_user(state, user_key, project_id, command).await?,
            )
            .map_err(|error| error.to_string())
        }
        _ => Err(format!("Unknown tool: {}", name)),
    }
}

fn required_str<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{} is required", key))
}

fn build_system_prompt<'a>(
    project_name: &str,
    project_id: &str,
    file_paths: impl Iterator<Item = &'a String>,
) -> String {
    let custom_context = fs::read_to_string(CONTEXT_PATH)
        .unwrap_or_else(|_| "No custom server context file was found.".to_string());
    let files = file_paths.cloned().collect::<Vec<_>>().join("\n- ");
    format!(
        r#"You are the SoroPG in-browser AI assistant. You help users edit Stellar Soroban smart contracts in the active browser workspace.

Rules:
- Inspect files before editing unless the requested change is trivial and the needed file is obvious.
- Prefer focused, minimal edits.
- Preserve Rust formatting and the existing project layout.
- The preferred contract layout is Cargo.toml, src/lib.rs, and src/test.rs.
- Use tools to read and change files. Do not claim edits were made unless a tool succeeded.
- After edits, run tests or build when it is useful and not excessive.
- Deployment is not available through tools because wallet signing stays in the browser.

Active project:
- id: {project_id}
- name: {project_name}
- files:
- {files}

Available tools:
- soropg_list_projects
- soropg_get_project
- soropg_list_files
- soropg_read_file
- soropg_create_file
- soropg_replace_file
- soropg_delete_file
- soropg_move_file
- soropg_run_command with command build, test, or audit

Custom server context:
{custom_context}
"#
    )
}

fn tool_definitions() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "soropg_list_projects",
                "description": "List SoroPG browser workspaces exposed by this user.",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_get_project",
                "description": "Get metadata and files for a SoroPG project. Defaults to the active project.",
                "parameters": project_id_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_list_files",
                "description": "List files in a SoroPG project. Defaults to the active project.",
                "parameters": project_id_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_read_file",
                "description": "Read one file from a SoroPG project.",
                "parameters": with_project_id(json!({
                    "path": { "type": "string", "description": "Relative path such as src/lib.rs" }
                }), vec!["path"])
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_create_file",
                "description": "Create a new file in a SoroPG project.",
                "parameters": file_write_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_replace_file",
                "description": "Replace the full contents of an existing SoroPG project file.",
                "parameters": file_write_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_delete_file",
                "description": "Delete a file from a SoroPG project.",
                "parameters": with_project_id(json!({
                    "path": { "type": "string" }
                }), vec!["path"])
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_move_file",
                "description": "Move or rename a file in a SoroPG project.",
                "parameters": with_project_id(json!({
                    "fromPath": { "type": "string" },
                    "toPath": { "type": "string" }
                }), vec!["fromPath", "toPath"])
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soropg_run_command",
                "description": "Run a whitelisted SoroPG backend command.",
                "parameters": with_project_id(json!({
                    "command": { "type": "string", "enum": ["build", "test", "audit"] }
                }), vec!["command"])
            }
        }
    ])
}

fn project_id_schema() -> Value {
    with_project_id(json!({}), vec![])
}

fn file_write_schema() -> Value {
    with_project_id(
        json!({
            "path": { "type": "string" },
            "content": { "type": "string" }
        }),
        vec!["path", "content"],
    )
}

fn with_project_id(mut properties: Value, required: Vec<&str>) -> Value {
    let map = properties
        .as_object_mut()
        .expect("properties must be object");
    map.insert(
        "projectId".to_string(),
        json!({ "type": "string", "description": "Optional SoroPG project id. Defaults to the active project." }),
    );
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

fn send_event(tx: &mpsc::UnboundedSender<Bytes>, event: &str, data: Value) {
    let line = json!({ "event": event, "data": data }).to_string() + "\n";
    let _ = tx.send(Bytes::from(line));
}

fn client_identity(req: &HttpRequest) -> String {
    if let Some(forwarded) = req
        .headers()
        .get("Forwarded")
        .and_then(|value| value.to_str().ok())
    {
        if let Some(for_part) = forwarded
            .split(';')
            .find(|part| part.trim_start().starts_with("for="))
        {
            return for_part
                .trim()
                .trim_start_matches("for=")
                .trim_matches('"')
                .to_string();
        }
    }
    if let Some(forwarded_for) = req
        .headers()
        .get("X-Forwarded-For")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
    {
        return forwarded_for.trim().to_string();
    }
    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn public_origin(req: &HttpRequest) -> String {
    let info = req.connection_info();
    format!("{}://{}", info.scheme(), info.host())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limiter_enforces_user_limit() {
        let mut limiter = RateLimiter::default();
        let now = Instant::now();
        for _ in 0..USER_REQUESTS_PER_HOUR {
            assert!(limiter.check("user-a", now).is_ok());
        }
        assert!(limiter.check("user-a", now).is_err());
        assert!(limiter.check("user-b", now).is_ok());
    }

    #[test]
    fn rate_limiter_expires_old_requests() {
        let mut limiter = RateLimiter::default();
        let now = Instant::now();
        for _ in 0..USER_REQUESTS_PER_HOUR {
            assert!(limiter.check("user-a", now).is_ok());
        }
        assert!(limiter
            .check("user-a", now + RATE_WINDOW + Duration::from_secs(1))
            .is_ok());
    }
}
