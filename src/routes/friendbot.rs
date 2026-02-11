use actix_web::{get, http::StatusCode, web, HttpResponse, Responder};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct FriendbotQuery {
    pub addr: String,
    pub friendbot_url: Option<String>,
}

fn resolve_friendbot_url(friendbot_url: Option<&str>) -> Result<reqwest::Url, String> {
    let default_url = "http://localhost:8000/friendbot";
    let raw_url = friendbot_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_url);

    let mut url = reqwest::Url::parse(raw_url)
        .map_err(|error| format!("Invalid friendbot URL: {}", error))?;

    match url.scheme() {
        "http" | "https" => {}
        other => return Err(format!("Unsupported friendbot URL scheme: {}", other)),
    }

    let host = url
        .host_str()
        .ok_or_else(|| "Friendbot URL host is missing".to_string())?
        .to_ascii_lowercase();
    if host != "localhost" && host != "127.0.0.1" && host != "::1" {
        return Err("Friendbot URL host must be localhost, 127.0.0.1, or ::1".to_string());
    }

    if url.path() == "/" {
        url.set_path("/friendbot");
    }

    Ok(url)
}

#[get("/friendbot")]
pub async fn friendbot(query: web::Query<FriendbotQuery>) -> impl Responder {
    let addr = query.addr.trim();
    if addr.is_empty() {
        return HttpResponse::BadRequest().body("Missing addr query parameter");
    }

    let mut url = match resolve_friendbot_url(query.friendbot_url.as_deref()) {
        Ok(url) => url,
        Err(error) => return HttpResponse::BadRequest().body(error),
    };
    url.query_pairs_mut().append_pair("addr", addr);

    let client = reqwest::Client::new();
    let response = match client.get(url).send().await {
        Ok(response) => response,
        Err(error) => {
            return HttpResponse::BadGateway()
                .body(format!("Failed to reach friendbot upstream: {}", error));
        }
    };

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("text/plain; charset=utf-8")
        .to_string();
    let body = response.text().await.unwrap_or_default();

    HttpResponse::build(status)
        .content_type(content_type)
        .body(body)
}
