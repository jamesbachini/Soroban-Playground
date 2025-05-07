use actix_web::{post, web, HttpResponse, Responder};
use tokio::time::{timeout, Duration};
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
