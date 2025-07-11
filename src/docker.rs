use std::{fs, process::Stdio};
use tempfile::TempDir;

pub async fn run_in_docker(code: String, command: &str) -> Result<(Vec<u8>, TempDir), String> {
    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let project = tmp.path().join("project");
    fs::create_dir(&project).map_err(|e| e.to_string())?;
    let cargo = include_str!("./templates/Cargo.toml.template");
    fs::write(project.join("Cargo.toml"), cargo).map_err(|e| e.to_string())?;
    let src = project.join("src");
    fs::create_dir(&src).map_err(|e| e.to_string())?;
    fs::write(src.join("lib.rs"), code).map_err(|e| e.to_string())?;
    let mut final_command = format!("cd /workspace/project && {}", command);
    if command.contains("build") {
        final_command = format!(
            "set -ex; cd /workspace/project && {} && cp /mnt/cargo/target/wasm32-unknown-unknown/release/project.wasm /host-tmp/project.wasm",
            command
        )
    }
    let output = tokio::process::Command::new("docker")
        .args(&[
            "run", "--rm", "--memory=2G", "--cpus=2",
            "-v", &format!("{}:/workspace", tmp.path().display()),
            "-v", "cargo-cache:/mnt/cargo",
            "-v", "/tmp:/host-tmp",
            "-e", "CARGO_HOME=/mnt/cargo",
            "-e", "CARGO_TARGET_DIR=/mnt/cargo/target",
            "wasm_sandbox:latest", "bash", "-c",
            &final_command
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| e.to_string())?;
    /*
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);  
    println!("Docker stdout:\n{}", stdout);
    println!("Docker stderr:\n{}", stderr);
    */
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok((output.stdout, tmp))
}
