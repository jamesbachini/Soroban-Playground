use actix_web::{post, web, HttpResponse, Responder};
use base64::Engine;
use bytes::Bytes;
use futures_util::StreamExt;
use tokio::{sync::mpsc, time};
use tokio_stream::wrappers::UnboundedReceiverStream;
use std::time::Duration;
use std::path::PathBuf;
use tracing::{info, error};

use crate::{docker::run_in_docker_with_files_and_id_stream, models::CompileRequest, semaphore::SEMAPHORE};

const WASM_BASE64_START: &[u8] = b"\n<<<SOROBAN_WASM_BASE64_START>>>\n";
const WASM_BASE64_END: &[u8] = b"\n<<<SOROBAN_WASM_BASE64_END>>>\n";

#[post("/compile")]
pub async fn compile(req: web::Json<CompileRequest>) -> impl Responder {

    let hash = {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        // Hash all files for better cache key
        if let Some(ref files_map) = req.files {
            for (filename, content) in files_map.iter() {
                h.update(filename.as_bytes());
                h.update(content.as_bytes());
            }
        } else if let Some(ref code) = req.code {
            h.update(code.as_bytes());
        }
        hex::encode(h.finalize())
    };

    let permit = match SEMAPHORE.acquire().await {
        Ok(p) => p,
        Err(_) => {
            error!("Semaphore closed");
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let (tx, rx) = mpsc::unbounded_channel::<Bytes>();

    // Extract code from either the code field or lib.rs from files
    let code = match &req.code {
        Some(c) => c.clone(),
        None => {
            // Extract lib.rs from files
            match &req.files {
                Some(files_map) => {
                    match files_map.get("lib.rs") {
                        Some(lib_rs_code) => lib_rs_code.clone(),
                        None => return HttpResponse::BadRequest().body("No code provided and no lib.rs file found")
                    }
                }
                None => return HttpResponse::BadRequest().body("No code or files provided")
            }
        }
    };

    let files = req.files.clone();
    let build_hash = hash.clone();

    tokio::spawn(async move {
        let _permit = permit;
        let mut heartbeat = time::interval(Duration::from_secs(25));

        let compile_fut = run_in_docker_with_files_and_id_stream(
            code,
            files,
            "stellar contract build",
            Some(build_hash),
            tx.clone(),
        );
        tokio::pin!(compile_fut);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if tx.send(Bytes::from_static(b" ")).is_err() {
                        break;
                    }
                }
                res = &mut compile_fut => {
                    match res {
                        Ok((_tmp, output_filename)) => {
                            let path = PathBuf::from(format!("/tmp/{}", output_filename));
                            match std::fs::read(&path) {
                                Ok(wasm) => {
                                    let encoded = base64::engine::general_purpose::STANDARD.encode(wasm);
                                    let _ = tx.send(Bytes::from_static(WASM_BASE64_START));
                                    let _ = tx.send(Bytes::from(encoded));
                                    let _ = tx.send(Bytes::from_static(WASM_BASE64_END));
                                    info!(hash=%hash, filename=%output_filename, "compiled successfully");
                                }
                                Err(e) => {
                                    let msg = format!("Compile Error: {}\n", e);
                                    let _ = tx.send(Bytes::from(msg));
                                }
                            }
                        }
                        Err(e) => {
                            let msg = format!("Build Errors: \n{}\n", e);
                            let _ = tx.send(Bytes::from(msg));
                        }
                    }
                    break;
                }
            }
        }
    });

    let stream = UnboundedReceiverStream::new(rx)
        .map(|bytes| Ok::<Bytes, actix_web::Error>(bytes));

    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .streaming(stream)
}
