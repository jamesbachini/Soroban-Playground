use actix_web::{post, web, HttpResponse, Responder};
use bytes::Bytes;
use futures_util::StreamExt;
use tokio::{sync::mpsc, time};
use tokio_stream::wrappers::ReceiverStream;
use std::time::Duration;

use crate::{docker::run_in_docker_with_files, models::CompileRequest, semaphore::SEMAPHORE};

#[post("/test")]
pub async fn test(req: web::Json<CompileRequest>) -> impl Responder {
    println!("Running unit tests");

    let permit = match SEMAPHORE.acquire().await {
        Ok(p) => p,
        Err(_) => {
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let (tx, rx) = mpsc::channel::<Result<Bytes, String>>(10);

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

    tokio::spawn(async move {
        let _permit = permit;
        let mut heartbeat = time::interval(Duration::from_secs(25));

        let test_fut = run_in_docker_with_files(code, files, "cargo test");
        tokio::pin!(test_fut);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if tx.send(Ok(Bytes::from_static(b" "))).await.is_err() { break; }
                }
                res = &mut test_fut => {
                    match res {
                        Ok((stdout, _tmp, _output_filename)) => {
                            let _ = tx.send(Ok(Bytes::from(stdout))).await;
                        }
                        Err(e) => {
                            let msg = format!("Test Errors: \n{}\n", e);
                            let _ = tx.send(Ok(Bytes::from(msg))).await;
                        }
                    }
                    break;
                }
            }
        }
    });

    let stream = ReceiverStream::new(rx).map(|chunk| {
        match chunk {
            Ok(bytes) => Ok::<Bytes, actix_web::Error>(bytes),
            Err(_) => unreachable!(),
        }
    });

    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .streaming(stream)
}
