use actix_web::{post, web, App, HttpResponse, HttpServer, Responder, middleware::Logger};
use actix_files::Files;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{fs, time::Duration};
use tempfile::TempDir;
use tokio::{sync::Semaphore, time::timeout};
use tracing::{error, info};

#[derive(Deserialize)]
struct CompileRequest {
    code: String,
}

/// Limit concurrency
static SEM: once_cell::sync::Lazy<Semaphore> =
    once_cell::sync::Lazy::new(|| Semaphore::new(4)); // max 4 concurrent builds

async fn run_in_docker(code: String, command: &str) -> Result<(Vec<u8>, TempDir), String> {

    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let project = tmp.path().join("project");
    fs::create_dir(&project).map_err(|e| e.to_string())?;

    let cargo = r#"[package]
name = "project"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "22.0.7"
sep-41-token = "1.2.0"

[dev-dependencies]
soroban-sdk = { version = "22.0.7", features = ["testutils"] }
sep-41-token = "1.2.0"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
"#;

    fs::write(project.join("Cargo.toml"), cargo).map_err(|e| e.to_string())?;
    let src = project.join("src");
    fs::create_dir(&src).map_err(|e| e.to_string())?;
    fs::write(src.join("lib.rs"), code).map_err(|e| e.to_string())?;

    let output = tokio::process::Command::new("docker")
        .args(&[
            "run", "--rm",
            "--memory=1G", "--cpus=2",
            "-v", &format!("{}:/workspace/project", project.display()),
            "wasm_sandbox:latest",
            "bash", "-c",
            &format!("cd /workspace/project && {}", command),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr);
    }

    Ok((output.stdout, tmp))
}

#[post("/compile")]
async fn compile(req: web::Json<CompileRequest>) -> impl Responder {
    println!("Compiling to WASM");
    let mut hasher = Sha256::new();
    hasher.update(&req.code);
    let hash = hex::encode(hasher.finalize());

    let permit = match SEM.acquire().await {
        Ok(p) => p,
        Err(_) => {
            error!("Semaphore closed");
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let code = req.code.clone();
    let compile_future = async move {
        let (_stdout, tmp) = run_in_docker(code, "cargo build --release --target wasm32-unknown-unknown").await?;
        let wasm_path = tmp
            .path()
            .join("project/target/wasm32-unknown-unknown/release/project.wasm");
        let wasm = fs::read(&wasm_path).map_err(|e| e.to_string())?;
        Ok(wasm)
    };

    let result = match timeout(Duration::from_secs(300), compile_future).await {
        Ok(Ok(wasm)) => Ok(wasm),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Compilation timed out".to_string()),
    };

    drop(permit);

    match result {
        Ok(wasm) => {
            info!(hash=%hash, "compiled successfully");
            HttpResponse::Ok()
                .content_type("application/wasm")
                .body(wasm)
        }
        Err(e) => {
            error!(%e, "compilation error");
            HttpResponse::BadRequest().body(e)
        }
    }
}

#[post("/test")]
async fn test(req: web::Json<CompileRequest>) -> impl Responder {
    println!("Running unit tests");
    let permit = match SEM.acquire().await {
        Ok(p) => p,
        Err(_) => {
            error!("Semaphore closed");
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let code = req.code.clone();
    let test_future = async move {
        let (stdout, _) = run_in_docker(code, "cargo test").await?;
        Ok::<_, String>(stdout)
    };

    let result = match timeout(Duration::from_secs(300), test_future).await {
        Ok(Ok(output)) => HttpResponse::Ok().body(String::from_utf8_lossy(&output).to_string()),
        Ok(Err(e)) => HttpResponse::BadRequest().body(e.to_string()),
        Err(_) => HttpResponse::RequestTimeout().body("Test run timed out"),
    };

    drop(permit);
    result
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting server at http://127.0.0.1:8080");

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            .service(compile)
            .service(test)
            .service(Files::new("/", "./frontend").index_file("index.html"))
    })
    .bind(("0.0.0.0", 8080))?
    .workers(4)
    .run()
    .await
}
