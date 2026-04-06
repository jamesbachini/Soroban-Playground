use serde::Deserialize;
use std::collections::HashMap;

pub const MAIN_SOURCE_CANDIDATES: &[&str] = &["src/lib.rs", "lib.rs"];

#[derive(Deserialize)]
pub struct CompileRequest {
    pub code: Option<String>,
    pub files: Option<HashMap<String, String>>,
}

#[derive(Deserialize)]
pub struct InterfaceRequest {
    pub contract: String,
    pub network: String,
}

pub fn extract_main_source(files: &HashMap<String, String>) -> Option<String> {
    MAIN_SOURCE_CANDIDATES
        .iter()
        .find_map(|path| files.get(*path).cloned())
}
