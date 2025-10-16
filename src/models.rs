use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct CompileRequest {
    pub code: Option<String>,
    pub files: Option<HashMap<String, String>>,
}

#[derive(Deserialize)]
pub struct InterfaceRequest {
    pub contract: String,
    pub network: String,
    pub code: Option<String>,
    pub files: Option<HashMap<String, String>>,
}