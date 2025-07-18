use actix_web::{post, web, HttpResponse, Responder};
use bytes::Bytes;
use futures_util::StreamExt;
use tokio::{sync::mpsc, time};
use tokio_stream::wrappers::ReceiverStream;
use std::time::Duration;
use std::path::PathBuf;
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

        let compile_fut = run_in_docker(code, "cargo build --release --target wasm32v1-none");
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
                        Ok((_, _tmp)) => {
                            let path = PathBuf::from("/tmp/project.wasm");
                            match std::fs::read(&path) {
                                Ok(wasm) => {
                                    let _ = tx.send(Ok(Bytes::from(wasm))).await;
                                    info!(hash=%hash, "compiled successfully");
                                }
                                Err(e) => {
                                    let msg = format!("Compile Error: {}\n", e);
                                    let _ = tx.send(Ok(Bytes::from(msg))).await;
                                }
                            }
                        }
                        Err(e) => {
                            let msg = format!("Build Errors: \n{}\n", e);
                            //let _ = tx.send(Err(msg.clone())).await;
                            let _ = tx.send(Ok(Bytes::from(msg))).await;
                        }
                    }
                    break;
                }
            }
        }
    });

    let stream = ReceiverStream::new(rx)
        .map(|res| match res {
            Ok(bytes) => Ok::<Bytes, actix_web::Error>(bytes),
            Err(_) => unreachable!(),
        });

    HttpResponse::Ok()
        .content_type("application/wasm")
        .streaming(stream)
}
