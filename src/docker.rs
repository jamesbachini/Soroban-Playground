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

    let output = tokio::process::Command::new("docker")
        .args(&[
            "run", "--rm", "--memory=2G", "--cpus=2",
            "-v", &format!("{}:/workspace/project", project.display()),
            "wasm_sandbox:latest", "bash", "-c",
            &format!("cd /workspace/project && {}", command),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok((output.stdout, tmp))
}
