use serde::Deserialize;

#[derive(Deserialize)]
pub struct CompileRequest {
    pub code: String,
}

#[derive(Deserialize)]
pub struct InterfaceRequest {
    pub contract: String,
    pub network: String,
}