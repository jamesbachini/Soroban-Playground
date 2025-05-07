use tokio::sync::Semaphore;
use once_cell::sync::Lazy;

/// Global concurrency limiter
pub static SEMAPHORE: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(4));
