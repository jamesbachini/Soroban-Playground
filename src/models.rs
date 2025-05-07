use serde::Deserialize;

#[derive(Deserialize)]
pub struct CompileRequest {
    pub code: String,
}
