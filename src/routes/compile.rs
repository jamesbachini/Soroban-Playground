use actix_web::{post, web, HttpResponse, Responder};
use bytes::Bytes;
use futures_util::StreamExt;
use tokio::{sync::mpsc, time};
use tokio_stream::wrappers::ReceiverStream;
use std::time::Duration;
use tracing::{info, error};

use crate::{docker::run_in_docker, models::CompileRequest, semaphore::SEMAPHORE};

#[post("/compile")]
pub async fn compile(req: web::Json<CompileRequest>) -> impl Responder {

    let hash = {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(&req.code);
        hex::encode(h.finalize())
    };

    let permit = match SEMAPHORE.acquire().await {
        Ok(p) => p,
        Err(_) => {
            error!("Semaphore closed");
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let (tx, rx) = mpsc::channel::<Result<Bytes, String>>(10);
    let code = req.code.clone();

    tokio::spawn(async move {
        let _permit = permit;
        let mut heartbeat = time::interval(Duration::from_secs(25));

        let compile_fut = run_in_docker(code, "cargo build --release --target wasm32-unknown-unknown");
        tokio::pin!(compile_fut);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if tx.send(Ok(Bytes::from_static(b" "))).await.is_err() {
                        break;
                    }
                }
                res = &mut compile_fut => {
                    match res {
                        Ok((_, tmp)) => {
                            println!("tmp: {}", tmp.path().display());
                            let path = tmp.path().join("project/target/wasm32-unknown-unknown/release/project.wasm");
                            println!("path: {}", path.display());
                            match std::fs::read(&path) {
                                Ok(wasm) => {
                                    let _ = tx.send(Ok(Bytes::from(wasm))).await;
                                    info!(hash=%hash, "compiled successfully");
                                }
                                Err(e) => {
                                    let msg = format!("I/O error reading wasm: {}", e);
                                    let _ = tx.send(Err(msg.clone())).await;
                                    error!(error=%e, "error reading wasm");
                                }
                            }
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            let _ = tx.send(Err(msg.clone())).await;
                            error!(error=%msg, "compilation error");
                        }
                    }
                    break;
                }
            }
        }
    });

    let stream = ReceiverStream::new(rx)
        .map(|res: Result<Bytes, String>| {
            res.map_err(|msg| actix_web::error::ErrorBadRequest(msg))
        });

    HttpResponse::Ok()
        .content_type("application/wasm")
        .streaming(stream)
}
