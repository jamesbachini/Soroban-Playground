use std::{
    collections::{HashMap, HashSet},
    path::{Component, Path},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use actix_web::{
    delete, get, post,
    web::{self, Data},
    HttpRequest, HttpResponse, Responder,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    docker::run_in_docker_with_files_and_id, models::extract_main_source, semaphore::SEMAPHORE,
};

const SESSION_TTL: Duration = Duration::from_secs(90);
const MAX_FILES: usize = 200;
const MAX_FILE_BYTES: usize = 1024 * 1024;
const MAX_WORKSPACE_BYTES: usize = 8 * 1024 * 1024;
const MAX_USERS: usize = 2048;
const MAX_PROJECTS_PER_USER: usize = 50;

#[derive(Default)]
pub struct McpState {
    store: Mutex<McpStore>,
}

#[derive(Default)]
struct McpStore {
    users: HashMap<String, UserProjects>,
}

#[derive(Default)]
struct UserProjects {
    projects: HashMap<String, ProjectRecord>,
    next_seq: u64,
}

#[derive(Clone)]
struct ProjectRecord {
    id: String,
    name: String,
    files: HashMap<String, String>,
    last_open_file: Option<String>,
    updated_at: u64,
    revision: u64,
    change_seq: u64,
    session_id: String,
    last_seen: Instant,
}

#[derive(Deserialize)]
pub struct BrowserHeartbeatRequest {
    pub session_id: String,
    pub active_workspace_id: Option<String>,
    pub workspaces: Vec<BrowserWorkspace>,
}

#[derive(Deserialize)]
pub struct BrowserWorkspace {
    pub id: String,
    pub name: String,
    pub files: HashMap<String, String>,
    #[serde(rename = "lastOpenFile")]
    pub last_open_file: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<u64>,
}

#[derive(Serialize)]
struct BrowserHeartbeatResponse {
    ok: bool,
    projects: Vec<ProjectSummary>,
}

#[derive(Deserialize)]
pub struct BrowserChangesQuery {
    pub session_id: String,
    pub since: Option<u64>,
}

#[derive(Serialize)]
struct BrowserChangesResponse {
    seq: u64,
    projects: Vec<ProjectSnapshot>,
}

#[derive(Serialize)]
struct ProjectSummary {
    id: String,
    name: String,
    files: usize,
    revision: u64,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
    #[serde(rename = "lastOpenFile")]
    last_open_file: Option<String>,
    active: bool,
}

#[derive(Serialize)]
struct ProjectSnapshot {
    id: String,
    name: String,
    files: HashMap<String, String>,
    revision: u64,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
    #[serde(rename = "lastOpenFile")]
    last_open_file: Option<String>,
}

#[derive(Serialize)]
struct FileEntry {
    path: String,
    size: usize,
}

#[derive(Serialize)]
struct FileContent {
    path: String,
    content: String,
    revision: u64,
}

#[derive(Deserialize)]
pub struct FileQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct UpsertFileRequest {
    pub path: String,
    pub content: String,
    pub mode: Option<String>,
}

#[derive(Deserialize)]
pub struct MoveFileRequest {
    #[serde(rename = "fromPath")]
    pub from_path: String,
    #[serde(rename = "toPath")]
    pub to_path: String,
}

#[derive(Deserialize)]
pub struct RunCommandRequest {
    pub command: String,
}

#[derive(Serialize)]
struct MutationResponse {
    ok: bool,
    revision: u64,
    seq: u64,
}

#[derive(Serialize)]
struct CommandResponse {
    ok: bool,
    command: String,
    output: String,
    revision: u64,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn error_response(status: actix_web::http::StatusCode, message: impl Into<String>) -> HttpResponse {
    HttpResponse::build(status).json(ErrorResponse {
        error: message.into(),
    })
}

fn bearer_hash(req: &HttpRequest) -> Result<String, HttpResponse> {
    let header = req
        .headers()
        .get(actix_web::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    let Some(token) = header.strip_prefix("Bearer ") else {
        return Err(error_response(
            actix_web::http::StatusCode::UNAUTHORIZED,
            "Missing bearer token",
        ));
    };

    let token = token.trim();
    if token.len() < 32 {
        return Err(error_response(
            actix_web::http::StatusCode::UNAUTHORIZED,
            "Bearer token is too short",
        ));
    }

    let mut hash = Sha256::new();
    hash.update(token.as_bytes());
    Ok(hex::encode(hash.finalize()))
}

fn is_safe_relative_path(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }

    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return false;
    }

    let mut saw_segment = false;
    for component in candidate.components() {
        match component {
            Component::Normal(segment) => {
                let Some(segment) = segment.to_str() else {
                    return false;
                };
                if segment == "." || segment == ".." {
                    return false;
                }
                if !segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
                {
                    return false;
                }
                saw_segment = true;
            }
            _ => return false,
        }
    }

    saw_segment
}

fn validate_files(files: &HashMap<String, String>) -> Result<(), String> {
    if files.len() > MAX_FILES {
        return Err(format!("Workspace exceeds {} files", MAX_FILES));
    }

    let mut total = 0usize;
    for (path, content) in files {
        if !is_safe_relative_path(path) {
            return Err(format!("Invalid file path: {}", path));
        }
        let size = content.len();
        if size > MAX_FILE_BYTES {
            return Err(format!("File exceeds 1 MiB: {}", path));
        }
        total = total.saturating_add(size);
    }

    if total > MAX_WORKSPACE_BYTES {
        return Err("Workspace exceeds 8 MiB".to_string());
    }

    Ok(())
}

fn cleanup_expired(store: &mut McpStore) {
    for user in store.users.values_mut() {
        user.projects
            .retain(|_, project| project.last_seen.elapsed() <= SESSION_TTL);
    }
    store.users.retain(|_, user| !user.projects.is_empty());
}

fn project_summary(project: &ProjectRecord, active_workspace_id: Option<&str>) -> ProjectSummary {
    ProjectSummary {
        id: project.id.clone(),
        name: project.name.clone(),
        files: project.files.len(),
        revision: project.revision,
        updated_at: project.updated_at,
        last_open_file: project.last_open_file.clone(),
        active: active_workspace_id == Some(project.id.as_str()),
    }
}

fn project_snapshot(project: &ProjectRecord) -> ProjectSnapshot {
    ProjectSnapshot {
        id: project.id.clone(),
        name: project.name.clone(),
        files: project.files.clone(),
        revision: project.revision,
        updated_at: project.updated_at,
        last_open_file: project.last_open_file.clone(),
    }
}

fn touch_project(project: &mut ProjectRecord, seq: u64) {
    project.updated_at = now_ms();
    project.revision = project.revision.saturating_add(1);
    project.change_seq = seq;
    project.last_seen = Instant::now();
}

fn mutate_project<F>(
    state: &Data<McpState>,
    user_key: &str,
    project_id: &str,
    mut change: F,
) -> Result<MutationResponse, HttpResponse>
where
    F: FnMut(&mut ProjectRecord) -> Result<(), HttpResponse>,
{
    let mut store = state.store.lock().map_err(|_| {
        error_response(
            actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
            "MCP store lock failed",
        )
    })?;
    cleanup_expired(&mut store);
    let user = store.users.get_mut(user_key).ok_or_else(|| {
        error_response(
            actix_web::http::StatusCode::NOT_FOUND,
            "Project is not connected",
        )
    })?;
    {
        let project = user.projects.get_mut(project_id).ok_or_else(|| {
            error_response(
                actix_web::http::StatusCode::NOT_FOUND,
                "Project is not connected",
            )
        })?;
        change(project)?;
    }
    user.next_seq = user.next_seq.saturating_add(1);
    let project = user.projects.get_mut(project_id).ok_or_else(|| {
        error_response(
            actix_web::http::StatusCode::NOT_FOUND,
            "Project is not connected",
        )
    })?;
    touch_project(project, user.next_seq);
    Ok(MutationResponse {
        ok: true,
        revision: project.revision,
        seq: project.change_seq,
    })
}

#[post("/api/mcp/v1/browser/heartbeat")]
pub async fn browser_heartbeat(
    req: HttpRequest,
    state: Data<McpState>,
    body: web::Json<BrowserHeartbeatRequest>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };

    if body.session_id.trim().len() < 8 {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "session_id is required",
        );
    }

    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "MCP store lock failed",
            )
        }
    };
    cleanup_expired(&mut store);

    let is_new_user = !store.users.contains_key(&user_key);
    if is_new_user && store.users.len() >= MAX_USERS {
        return error_response(
            actix_web::http::StatusCode::SERVICE_UNAVAILABLE,
            "MCP relay is at capacity",
        );
    }

    let user = store.users.entry(user_key).or_default();
    let mut summaries = Vec::new();
    let session_id = body.session_id.trim().to_string();
    if body.workspaces.len() > MAX_PROJECTS_PER_USER {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            format!("Session exceeds {} projects", MAX_PROJECTS_PER_USER),
        );
    }
    let published_ids = body
        .workspaces
        .iter()
        .map(|workspace| workspace.id.clone())
        .collect::<HashSet<_>>();
    user.projects.retain(|_, project| {
        project.session_id != session_id || published_ids.contains(&project.id)
    });

    for workspace in &body.workspaces {
        if workspace.id.trim().is_empty() {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Workspace id is required",
            );
        }
        if let Err(error) = validate_files(&workspace.files) {
            return error_response(actix_web::http::StatusCode::BAD_REQUEST, error);
        }

        let project = user
            .projects
            .entry(workspace.id.clone())
            .or_insert_with(|| ProjectRecord {
                id: workspace.id.clone(),
                name: workspace.name.clone(),
                files: workspace.files.clone(),
                last_open_file: workspace.last_open_file.clone(),
                updated_at: workspace.updated_at.unwrap_or_else(now_ms),
                revision: 0,
                change_seq: 0,
                session_id: session_id.clone(),
                last_seen: Instant::now(),
            });

        let incoming_updated_at = workspace.updated_at.unwrap_or_else(now_ms);
        if incoming_updated_at >= project.updated_at || project.session_id != session_id {
            project.name = workspace.name.clone();
            project.files = workspace.files.clone();
            project.last_open_file = workspace.last_open_file.clone();
            project.updated_at = incoming_updated_at;
        }
        project.session_id = session_id.clone();
        project.last_seen = Instant::now();
        summaries.push(project_summary(
            project,
            body.active_workspace_id.as_deref(),
        ));
    }

    HttpResponse::Ok().json(BrowserHeartbeatResponse {
        ok: true,
        projects: summaries,
    })
}

#[get("/api/mcp/v1/browser/changes")]
pub async fn browser_changes(
    req: HttpRequest,
    state: Data<McpState>,
    query: web::Query<BrowserChangesQuery>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let since = query.since.unwrap_or(0);

    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "MCP store lock failed",
            )
        }
    };
    cleanup_expired(&mut store);

    let mut seq = since;
    let mut projects = Vec::new();
    if let Some(user) = store.users.get_mut(&user_key) {
        for project in user.projects.values_mut() {
            if project.session_id == query.session_id && project.change_seq > since {
                project.last_seen = Instant::now();
                seq = seq.max(project.change_seq);
                projects.push(project_snapshot(project));
            }
        }
    }

    HttpResponse::Ok().json(BrowserChangesResponse { seq, projects })
}

#[get("/api/mcp/v1/projects")]
pub async fn list_projects(req: HttpRequest, state: Data<McpState>) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };

    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "MCP store lock failed",
            )
        }
    };
    cleanup_expired(&mut store);
    let projects = store
        .users
        .get(&user_key)
        .map(|user| {
            user.projects
                .values()
                .map(|project| project_summary(project, None))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    HttpResponse::Ok().json(projects)
}

#[get("/api/mcp/v1/projects/{project_id}")]
pub async fn get_project(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();

    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "MCP store lock failed",
            )
        }
    };
    cleanup_expired(&mut store);
    match store
        .users
        .get(&user_key)
        .and_then(|user| user.projects.get(&project_id))
    {
        Some(project) => HttpResponse::Ok().json(project_snapshot(project)),
        None => error_response(
            actix_web::http::StatusCode::NOT_FOUND,
            "Project is not connected",
        ),
    }
}

#[get("/api/mcp/v1/projects/{project_id}/files")]
pub async fn list_files(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();

    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "MCP store lock failed",
            )
        }
    };
    cleanup_expired(&mut store);
    let Some(project) = store
        .users
        .get(&user_key)
        .and_then(|user| user.projects.get(&project_id))
    else {
        return error_response(
            actix_web::http::StatusCode::NOT_FOUND,
            "Project is not connected",
        );
    };

    let mut files = project
        .files
        .iter()
        .map(|(path, content)| FileEntry {
            path: path.clone(),
            size: content.len(),
        })
        .collect::<Vec<_>>();
    files.sort_by(|a, b| a.path.cmp(&b.path));

    HttpResponse::Ok().json(files)
}

#[get("/api/mcp/v1/projects/{project_id}/file")]
pub async fn read_file(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
    query: web::Query<FileQuery>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();
    let file_path = match normalize_mcp_path(&query.path) {
        Ok(path) => path,
        Err(error) => return error_response(actix_web::http::StatusCode::BAD_REQUEST, error),
    };

    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "MCP store lock failed",
            )
        }
    };
    cleanup_expired(&mut store);
    let Some(project) = store
        .users
        .get(&user_key)
        .and_then(|user| user.projects.get(&project_id))
    else {
        return error_response(
            actix_web::http::StatusCode::NOT_FOUND,
            "Project is not connected",
        );
    };

    match project.files.get(&file_path) {
        Some(content) => HttpResponse::Ok().json(FileContent {
            path: file_path,
            content: content.clone(),
            revision: project.revision,
        }),
        None => error_response(actix_web::http::StatusCode::NOT_FOUND, "File not found"),
    }
}

#[post("/api/mcp/v1/projects/{project_id}/file")]
pub async fn upsert_file(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
    body: web::Json<UpsertFileRequest>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();
    let file_path = match normalize_mcp_path(&body.path) {
        Ok(path) => path,
        Err(error) => return error_response(actix_web::http::StatusCode::BAD_REQUEST, error),
    };
    if body.content.len() > MAX_FILE_BYTES {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "File exceeds 1 MiB",
        );
    }
    let mode = body.mode.as_deref().unwrap_or("replace");
    if mode != "create" && mode != "replace" {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "mode must be create or replace",
        );
    }

    match mutate_project(&state, &user_key, &project_id, |project| {
        if mode == "create" && project.files.contains_key(&file_path) {
            return Err(error_response(
                actix_web::http::StatusCode::CONFLICT,
                "File already exists",
            ));
        }
        if mode == "replace" && !project.files.contains_key(&file_path) {
            return Err(error_response(
                actix_web::http::StatusCode::NOT_FOUND,
                "File not found",
            ));
        }
        let mut next_files = project.files.clone();
        next_files.insert(file_path.clone(), body.content.clone());
        validate_files(&next_files)
            .map_err(|error| error_response(actix_web::http::StatusCode::BAD_REQUEST, error))?;
        project.files = next_files;
        project.last_open_file = Some(file_path.clone());
        Ok(())
    }) {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(response) => response,
    }
}

#[delete("/api/mcp/v1/projects/{project_id}/file")]
pub async fn delete_file(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
    query: web::Query<FileQuery>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();
    let file_path = match normalize_mcp_path(&query.path) {
        Ok(path) => path,
        Err(error) => return error_response(actix_web::http::StatusCode::BAD_REQUEST, error),
    };

    match mutate_project(&state, &user_key, &project_id, |project| {
        if file_path == "Cargo.toml" {
            return Err(error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Cargo.toml cannot be deleted",
            ));
        }
        if project.files.len() <= 1 {
            return Err(error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Cannot delete the last file",
            ));
        }
        if project.files.remove(&file_path).is_none() {
            return Err(error_response(
                actix_web::http::StatusCode::NOT_FOUND,
                "File not found",
            ));
        }
        if project.last_open_file.as_deref() == Some(&file_path) {
            project.last_open_file = project.files.keys().min().cloned();
        }
        Ok(())
    }) {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(response) => response,
    }
}

#[post("/api/mcp/v1/projects/{project_id}/move")]
pub async fn move_file(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
    body: web::Json<MoveFileRequest>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();
    let from_path = match normalize_mcp_path(&body.from_path) {
        Ok(path) => path,
        Err(error) => return error_response(actix_web::http::StatusCode::BAD_REQUEST, error),
    };
    let to_path = match normalize_mcp_path(&body.to_path) {
        Ok(path) => path,
        Err(error) => return error_response(actix_web::http::StatusCode::BAD_REQUEST, error),
    };

    match mutate_project(&state, &user_key, &project_id, |project| {
        if from_path == "Cargo.toml" {
            return Err(error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Cargo.toml cannot be moved",
            ));
        }
        if project.files.contains_key(&to_path) {
            return Err(error_response(
                actix_web::http::StatusCode::CONFLICT,
                "Destination file already exists",
            ));
        }
        let Some(content) = project.files.remove(&from_path) else {
            return Err(error_response(
                actix_web::http::StatusCode::NOT_FOUND,
                "Source file not found",
            ));
        };
        project.files.insert(to_path.clone(), content);
        if project.last_open_file.as_deref() == Some(&from_path) {
            project.last_open_file = Some(to_path.clone());
        }
        Ok(())
    }) {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(response) => response,
    }
}

#[post("/api/mcp/v1/projects/{project_id}/commands")]
pub async fn run_command(
    req: HttpRequest,
    state: Data<McpState>,
    path: web::Path<String>,
    body: web::Json<RunCommandRequest>,
) -> impl Responder {
    let user_key = match bearer_hash(&req) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let project_id = path.into_inner();
    let command_name = body.command.trim().to_ascii_lowercase();

    if command_name == "deploy" {
        return error_response(
            actix_web::http::StatusCode::NOT_IMPLEMENTED,
            "Deploy is not supported by the MCP API in v1",
        );
    }

    let docker_command = match command_name.as_str() {
        "build" => "stellar contract build",
        "test" => "cargo test",
        "audit" => "CARGO_BUILD_JOBS=1 cargo scout-audit --debug -v --scout-source /scout-audit --local-detectors /scout-audit/nightly",
        _ => {
            return error_response(
                actix_web::http::StatusCode::BAD_REQUEST,
                "Unsupported command. Allowed commands: build, test, audit, deploy",
            )
        }
    };

    let (files, revision) = {
        let mut store = match state.store.lock() {
            Ok(store) => store,
            Err(_) => {
                return error_response(
                    actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "MCP store lock failed",
                )
            }
        };
        cleanup_expired(&mut store);
        let Some(project) = store
            .users
            .get(&user_key)
            .and_then(|user| user.projects.get(&project_id))
        else {
            return error_response(
                actix_web::http::StatusCode::NOT_FOUND,
                "Project is not connected",
            );
        };
        (project.files.clone(), project.revision)
    };

    let Some(code) = extract_main_source(&files) else {
        return error_response(
            actix_web::http::StatusCode::BAD_REQUEST,
            "No src/lib.rs or lib.rs file found",
        );
    };

    let permit = match SEMAPHORE.acquire().await {
        Ok(permit) => permit,
        Err(_) => {
            return error_response(
                actix_web::http::StatusCode::SERVICE_UNAVAILABLE,
                "Server shutting down",
            )
        }
    };
    let _permit = permit;

    let build_id = if command_name == "build" || command_name == "audit" {
        let mut hash = Sha256::new();
        let mut entries: Vec<_> = files.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));
        for (path, content) in entries {
            hash.update(path.as_bytes());
            hash.update(content.as_bytes());
        }
        Some(hex::encode(hash.finalize()))
    } else {
        None
    };

    match run_in_docker_with_files_and_id(code, Some(files), docker_command, build_id).await {
        Ok((output, _tmp, output_filename)) => {
            let mut output = String::from_utf8_lossy(&output).to_string();
            if command_name == "build" {
                output.push_str(&format!("\nBuild artifact: {}\n", output_filename));
            }
            HttpResponse::Ok().json(CommandResponse {
                ok: true,
                command: command_name,
                output,
                revision,
            })
        }
        Err(error) => HttpResponse::Ok().json(CommandResponse {
            ok: false,
            command: command_name,
            output: error,
            revision,
        }),
    }
}

fn normalize_mcp_path(path: &str) -> Result<String, String> {
    let normalized = path
        .trim()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    if !is_safe_relative_path(&normalized) {
        return Err(format!("Invalid file path: {}", path));
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{http::StatusCode, test as actix_test, web, App};
    use serde_json::json;

    #[test]
    fn validates_safe_paths() {
        assert!(is_safe_relative_path("src/lib.rs"));
        assert!(is_safe_relative_path("contracts/hello_world/src/lib.rs"));
        assert!(!is_safe_relative_path("../src/lib.rs"));
        assert!(!is_safe_relative_path("/src/lib.rs"));
        assert!(!is_safe_relative_path("src/lib rs"));
        assert!(!is_safe_relative_path(""));
    }

    #[test]
    fn enforces_workspace_limits() {
        let mut files = HashMap::new();
        files.insert("Cargo.toml".to_string(), "x".to_string());
        assert!(validate_files(&files).is_ok());

        files.insert("../bad".to_string(), "x".to_string());
        assert!(validate_files(&files).is_err());
    }

    #[actix_web::test]
    async fn authenticated_relay_updates_project_files() {
        let app = actix_test::init_service(
            App::new()
                .app_data(web::Data::new(McpState::default()))
                .service(browser_heartbeat)
                .service(list_projects)
                .service(upsert_file)
                .service(read_file),
        )
        .await;
        let token = "a".repeat(40);

        let publish = actix_test::TestRequest::post()
            .uri("/api/mcp/v1/browser/heartbeat")
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .set_json(json!({
                "session_id": "session-123",
                "active_workspace_id": "workspace-1",
                "workspaces": [{
                    "id": "workspace-1",
                    "name": "Demo",
                    "files": {
                        "Cargo.toml": "[package]\nname = \"project\"\n",
                        "src/lib.rs": "pub fn old() {}\n"
                    },
                    "lastOpenFile": "src/lib.rs",
                    "updatedAt": 1
                }]
            }))
            .to_request();
        let publish_response = actix_test::call_service(&app, publish).await;
        assert_eq!(publish_response.status(), StatusCode::OK);

        let replace = actix_test::TestRequest::post()
            .uri("/api/mcp/v1/projects/workspace-1/file")
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .set_json(json!({
                "path": "src/lib.rs",
                "content": "pub fn new() {}\n",
                "mode": "replace"
            }))
            .to_request();
        let replace_response = actix_test::call_service(&app, replace).await;
        assert_eq!(replace_response.status(), StatusCode::OK);

        let read = actix_test::TestRequest::get()
            .uri("/api/mcp/v1/projects/workspace-1/file?path=src%2Flib.rs")
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .to_request();
        let read_response: serde_json::Value =
            actix_test::call_and_read_body_json(&app, read).await;
        assert_eq!(read_response["content"], "pub fn new() {}\n");
    }
}
