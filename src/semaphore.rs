use once_cell::sync::Lazy;
use tokio::sync::Semaphore;

/// Global concurrency limiter
pub static SEMAPHORE: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(4));
