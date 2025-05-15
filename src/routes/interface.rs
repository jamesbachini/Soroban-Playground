use actix_web::{post, web, HttpResponse, Responder};
use bytes::Bytes;
use futures_util::StreamExt;
use tokio::{sync::mpsc, time};
use tokio_stream::wrappers::ReceiverStream;
use std::time::Duration;

use crate::{docker::run_in_docker, models::InterfaceRequest, semaphore::SEMAPHORE};

#[post("/interface")]
pub async fn interface(req: web::Json<InterfaceRequest>) -> impl Responder {
    println!("Requesting contract interface");

    let permit = match SEMAPHORE.acquire().await {
        Ok(p) => p,
        Err(_) => {
            return HttpResponse::ServiceUnavailable().body("Server shutting down");
        }
    };

    let (tx, rx) = mpsc::channel::<Result<Bytes, String>>(10);
    let network = req.network.clone();
    let contract_id = req.contract.clone();

    let blank_code: String = String::new();
    let clean_network: String = network.chars().filter(|c| c.is_alphanumeric()).collect();
    let clean_contract_id: String = contract_id.chars().filter(|c| c.is_alphanumeric()).collect();

    let command = format!(
        "stellar contract info interface --network {} --contract-id {}",
        clean_network,
        clean_contract_id
    );
    /*
    let command = format!(
        "{}",
        contract_id
    );
    */
    tokio::spawn(async move {
        let _permit = permit;
        let mut heartbeat = time::interval(Duration::from_secs(25));

        let interface_fut = run_in_docker(blank_code, &command);
        tokio::pin!(interface_fut);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if tx.send(Ok(Bytes::from_static(b" "))).await.is_err() { break; }
                }
                res = &mut interface_fut => {
                    match res {
                        Ok((stdout, _tmp)) => {
                            let _ = tx.send(Ok(Bytes::from(stdout))).await;
                        }
                        Err(e) => {
                            let msg = format!("Interface Errors: \n{}\n", e);
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
