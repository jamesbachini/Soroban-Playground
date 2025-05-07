use actix_web::{post, web, HttpResponse, Responder};
use sha2::{Digest, Sha256};
use tokio::time::{timeout, Duration};
use tracing::{error, info};

use crate::{docker::run_in_docker, models::CompileRequest, semaphore::SEMAPHORE};

#[post("/compile")]
pub async fn compile(req: web::Json<CompileRequest>) -> impl Responder {
    println!("Compiling to WASM");
    let mut hasher = Sha256::new();
    hasher.update(&req.code);
    let hash = hex::encode(hasher.finalize());

    let permit = match SEMAPHORE.acquire().await {
        Ok(p) => p,
        Err(_) => {
            error!("Semaphore closed");
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let code = req.code.clone();
    let compile_future = async move {
        let (_stdout, tmp) = run_in_docker(code, "cargo build --release --target wasm32-unknown-unknown").await?;
        let wasm_path = tmp.path().join("project/target/wasm32-unknown-unknown/release/project.wasm");
        let wasm = std::fs::read(&wasm_path).map_err(|e| e.to_string())?;
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
            info!(hash = %hash, "compiled successfully");
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
