use std::{fs, process::Stdio, collections::HashMap};
use tempfile::TempDir;

fn is_safe_filename(filename: &str) -> bool {
    // Only allow alphanumeric, underscore, dash, and dot
    // Must not start with dot or dash
    // Must not contain path traversal sequences
    if filename.is_empty() || filename.starts_with('.') || filename.starts_with('-') {
        return false;
    }

    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return false;
    }

    filename.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.')
}

fn is_safe_file_content(content: &str) -> bool {
    // Basic checks for suspicious content
    let suspicious_patterns = [
        "std::process::",
        "Command::",
        "system(",
        "exec(",
        "/bin/",
        "/usr/bin/",
        "unsafe",
        "#[no_mangle]",
        "extern \"C\"",
        "asm!",
        "include_str!",
        "include_bytes!",
        "env!",
        "std::env::",
        "std::fs::",
        "std::net::",
        "tokio::process::",
        "tokio::fs::",
        "actix_web::",
        "reqwest::",
        "hyper::",
    ];

    // Allow legitimate Soroban patterns but block system access
    if content.contains("soroban_sdk") || content.contains("stellar") || content.contains("#[contract]") {
        // This is likely legitimate Soroban code, but still check for dangerous patterns
        return !suspicious_patterns.iter().any(|&pattern| content.contains(pattern));
    }

    // For non-Soroban files, be more restrictive
    !suspicious_patterns.iter().any(|&pattern| content.contains(pattern))
}

pub async fn run_in_docker(code: String, command: &str) -> Result<(Vec<u8>, TempDir), String> {
    run_in_docker_with_files(code, None, command).await
}

pub async fn run_in_docker_with_files(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str
) -> Result<(Vec<u8>, TempDir), String> {
    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let project = tmp.path().join("project");
    fs::create_dir(&project).map_err(|e| e.to_string())?;

    // Validate main code content
    if !is_safe_file_content(&code) {
        return Err("Unsafe code content detected in main file".to_string());
    }

    // Handle Cargo.toml - must be provided in files
    if let Some(ref files_map) = files {
        if let Some(custom_cargo) = files_map.get("Cargo.toml") {
            if !is_safe_file_content(custom_cargo) {
                return Err("Unsafe content detected in Cargo.toml".to_string());
            }
            fs::write(project.join("Cargo.toml"), custom_cargo).map_err(|e| e.to_string())?;
        } else {
            return Err("Cargo.toml file is required but not provided".to_string());
        }
    } else {
        return Err("Files are required but not provided".to_string());
    }

    // Create src directory and lib.rs
    let src = project.join("src");
    fs::create_dir(&src).map_err(|e| e.to_string())?;
    fs::write(src.join("lib.rs"), code).map_err(|e| e.to_string())?;

    // Handle additional files
    if let Some(files_map) = files {
        for (filename, content) in files_map {
            // Skip Cargo.toml as it's already handled
            if filename == "Cargo.toml" {
                continue;
            }

            // Validate filename
            if !is_safe_filename(&filename) {
                return Err(format!("Invalid filename: {}", filename));
            }

            // Validate content
            if !is_safe_file_content(&content) {
                return Err(format!("Unsafe content detected in file: {}", filename));
            }

            // Determine where to place the file
            let file_path = if filename.ends_with(".rs") && filename != "lib.rs" {
                // Rust files go in src/
                src.join(&filename)
            } else if filename == "README.md" || filename.ends_with(".md") || filename.ends_with(".txt") {
                // Documentation files go in project root
                project.join(&filename)
            } else {
                // Other files (tests, configs, etc.) go in project root
                project.join(&filename)
            };

            fs::write(file_path, content).map_err(|e| format!("Failed to write {}: {}", filename, e))?;
        }
    }
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

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    println!("Docker stdout:\n{}", stdout);
    println!("Docker stderr:\n{}", stderr);
    if !output.status.success() {
        let mut combined_output = String::new();

        let stdout_str = String::from_utf8_lossy(&output.stdout);
        let stderr_str = String::from_utf8_lossy(&output.stderr);

        if !stdout_str.is_empty() {
            combined_output.push_str(&stdout_str);
        }
        if !stderr_str.is_empty() {
            if !combined_output.is_empty() {
                combined_output.push('\n');
            }
            combined_output.push_str(&stderr_str);
        }

        return Err(combined_output);
    }
    Ok((output.stdout, tmp))
}
