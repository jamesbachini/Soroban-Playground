/*                     /   \
               )      ((   ))     (
(@)           /|\      ))_((     /|\          (@)
|-|          / | \    (/\|/\)   / | \         |-|
| |---------/--|-voV---\>|</--Vov-|--\--------| |
| |              '^'   (o o)  '^'             | |
| |          Soroban Playground v0.4.1        | |
| |___________________________________________| |
|-|   /   /\ /         ( (       \ /\   \     |-|
(@)   | /   V           \ \       V   \ |     (@)
      |/                _) )_          \|
                        '\ /'
                          '
*/
mod routes;
mod docker;
mod models;
mod semaphore;

use actix_files::Files;
use actix_web::{middleware::Logger, App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting server at http://127.0.0.1:80");

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            .service(routes::compile::compile)
            .service(routes::test::test)
            .service(routes::interface::interface)
            .service(Files::new("/", "./frontend").index_file("index.html"))
    })
    .bind(("0.0.0.0", 80))?
    .workers(4)
    .run()
    .await
}
