use actix_web::{post, web, HttpResponse, Responder};
use bytes::Bytes;
use futures_util::StreamExt;
use tokio::{sync::mpsc, time};
use tokio_stream::wrappers::ReceiverStream;
use std::time::Duration;
use tracing::error;

use crate::{docker::run_in_docker, models::CompileRequest, semaphore::SEMAPHORE};

#[post("/test")]
pub async fn test(req: web::Json<CompileRequest>) -> impl Responder {
    println!("Running unit tests");

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

        let test_fut = run_in_docker(code, "cargo test");
        tokio::pin!(test_fut);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if tx.send(Ok(Bytes::from_static(b" "))).await.is_err() { break; }
                }
                res = &mut test_fut => {
                    match res {
                        Ok((stdout, _tmp)) => {
                            let _ = tx.send(Ok(Bytes::from(stdout))).await;
                        }
                        Err(e) => {
                            let msg = format!("Test run error: {}", e);
                            let _ = tx.send(Err(msg.clone())).await;
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
        .content_type("text/plain; charset=utf-8")
        .streaming(stream)
}
