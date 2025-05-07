/*
  ____                  _                   ____  _                                             _ 
 / ___|  ___  _ __ ___ | |__   __ _ _ __   |  _ \| | __ _ _   _  __ _ _ __ ___  _   _ _ __   __| |
 \___ \ / _ \| `__/ _ \|  _ \ / _  | `_ \  | |_) | |/ _  | | | |/ _  | `__/ _ \| | | | `_ \ / _  |
  ___) | (_) | | | (_) | |_) | (_| | | | | |  __/| | (_| | |_| | (_| | | | (_) | |_| | | | | (_| |
 |____/ \___/|_|  \___/|_.__/ \__,_|_| |_| |_|   |_|\__,_|\__, |\__, |_|  \___/ \__,_|_| |_|\__,_|
                                                          |___/ |___/                                             
*/
mod routes;
mod docker;
mod models;
mod semaphore;

use actix_files::Files;
use actix_web::{middleware::Logger, App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting server at http://127.0.0.1:8080");

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            .service(routes::compile::compile)
            .service(routes::test::test)
            .service(Files::new("/", "./frontend").index_file("index.html"))
    })
    .bind(("0.0.0.0", 8080))?
    .workers(4)
    .run()
    .await
}
