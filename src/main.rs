/*                     /   \
               )      ((   ))     (
(@)           /|\      ))_((     /|\          (@)
|-|          / | \    (/\|/\)   / | \         |-|
| |---------/--|-voV---\>|</--Vov-|--\--------| |
| |              '^'   (o o)  '^'             | |
| |          Soroban Playground v0.7.1        | |
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
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let args: Vec<String> = env::args().collect();
    let mut port = 80;

    // Parse command line arguments for --port
    for i in 1..args.len() {
        if args[i] == "--port" && i + 1 < args.len() {
            match args[i + 1].parse::<u16>() {
                Ok(p) => port = p,
                Err(_) => {
                    eprintln!("Invalid port number: {}", args[i + 1]);
                    std::process::exit(1);
                }
            }
            break;
        }
    }

    println!("Starting server at http://127.0.0.1:{}", port);

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
    .bind(("0.0.0.0", port))?
    .workers(4)
    .run()
    .await
}
