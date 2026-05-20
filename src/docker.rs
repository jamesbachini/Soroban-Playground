use std::{
    collections::HashMap,
    fs,
    path::{Component, Path},
    process::Stdio,
};

use bytes::Bytes;
use regex::Regex;
use tempfile::TempDir;
use tokio::{io::AsyncReadExt, sync::mpsc};

struct PreparedDockerRun {
    tmp: TempDir,
    final_command: String,
    output_filename: String,
    target_dir: String,
}

fn with_rustup_bootstrap(command: &str, trace: bool) -> String {
    let set_flags = if trace {
        "set -e; set -o pipefail; set -x"
    } else {
        "set -e; set -o pipefail"
    };
    format!(
        "{}; mkdir -p /mnt/cargo/bin; [ -x /mnt/cargo/bin/rustup ] || ln -sf /usr/local/cargo/bin/rustup /mnt/cargo/bin/rustup; export PATH=/mnt/cargo/bin:$PATH; target_dir=\"$CARGO_TARGET_DIR\"; [ -n \"$target_dir\" ] || target_dir=/mnt/cargo/target; if [ -x /opt/scout-prebuilt/scout-driver ] && [ -x /opt/scout-prebuilt/detector-helper ]; then mkdir -p \"$target_dir/release\"; cp -f /opt/scout-prebuilt/scout-driver \"$target_dir/release/scout-driver\"; cp -f /opt/scout-prebuilt/detector-helper \"$target_dir/release/detector-helper\"; fi; {}",
        set_flags, command
    )
}

fn is_safe_relative_path(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }

    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return false;
    }

    let mut saw_segment = false;
    for component in candidate.components() {
        match component {
            Component::Normal(segment) => {
                let segment = match segment.to_str() {
                    Some(value) => value,
                    None => return false,
                };
                if segment.starts_with('.') || segment.starts_with('-') {
                    return false;
                }
                if !segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
                {
                    return false;
                }
                saw_segment = true;
            }
            _ => return false,
        }
    }

    saw_segment
}

fn legacy_workspace_path(path: &str, files: &HashMap<String, String>) -> String {
    match path {
        "lib.rs" if !files.contains_key("src/lib.rs") => "src/lib.rs".to_string(),
        "test.rs" if !files.contains_key("src/test.rs") => "src/test.rs".to_string(),
        _ => path.to_string(),
    }
}

fn write_project_file(project: &Path, relative_path: &str, content: &str) -> Result<(), String> {
    if !is_safe_relative_path(relative_path) {
        return Err(format!("Invalid filename: {}", relative_path));
    }

    let full_path = project.join(relative_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory for {}: {}", relative_path, e))?;
    }

    fs::write(&full_path, content).map_err(|e| format!("Failed to write {}: {}", relative_path, e))
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
    if content.contains("soroban_sdk")
        || content.contains("stellar")
        || content.contains("#[contract]")
    {
        // This is likely legitimate Soroban code, but still check for dangerous patterns
        return !suspicious_patterns
            .iter()
            .any(|&pattern| content.contains(pattern));
    }

    // For non-Soroban files, be more restrictive
    !suspicious_patterns
        .iter()
        .any(|&pattern| content.contains(pattern))
}

fn to_snake_case(s: &str) -> String {
    let mut result = String::new();
    let mut prev_is_lowercase = false;

    for (i, ch) in s.chars().enumerate() {
        if ch.is_uppercase() {
            // Add underscore before uppercase letter if:
            // - Not at the start
            // - Previous character was lowercase
            if i > 0 && prev_is_lowercase {
                result.push('_');
            }
            result.push(ch.to_lowercase().next().unwrap());
            prev_is_lowercase = false;
        } else {
            result.push(ch);
            prev_is_lowercase = ch.is_lowercase();
        }
    }

    result
}

fn extract_contract_name(code: &str) -> Option<String> {
    // Remove comments from code
    let code_without_comments = code
        .lines()
        .map(|line| {
            if let Some(pos) = line.find("//") {
                &line[..pos]
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Look for #[contract] pub struct ContractName
    let re = Regex::new(r#"#\[\s*contract\s*\]\s*pub\s+struct\s+([A-Za-z0-9_]+)\s*;"#).ok()?;
    re.captures(&code_without_comments)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

fn build_wasm_copy_command(
    command: &str,
    target_dir: &str,
    expected_wasm_filename: &str,
    output_filename: &str,
) -> String {
    format!(
        concat!(
            "build_log=\"$(mktemp)\"; ",
            "release_dir=\"{target_dir}/wasm32v1-none/release\"; ",
            "cd /workspace/project; ",
            "{command} 2>&1 | tee \"$build_log\"; ",
            "wasm_path=\"$release_dir/{expected_wasm_filename}.wasm\"; ",
            "if [ ! -f \"$wasm_path\" ]; then ",
            "wasm_path=\"$(sed -n 's/^[[:space:]]*Wasm File: //p' \"$build_log\" | tail -n 1)\"; ",
            "fi; ",
            "if [ -n \"$wasm_path\" ] && [ ! -f \"$wasm_path\" ]; then ",
            "case \"$wasm_path\" in ",
            "/*) ;; ",
            "*) wasm_path=\"/workspace/project/$wasm_path\" ;; ",
            "esac; ",
            "fi; ",
            "if [ ! -f \"$wasm_path\" ]; then ",
            "echo \"Expected WASM artifact '$release_dir/{expected_wasm_filename}.wasm' was not found; probing release directory.\" >&2; ",
            "artifact_list=\"$(mktemp)\"; ",
            "find \"$release_dir\" -maxdepth 1 -type f -name '*.wasm' ! -name '*.optimized.wasm' -printf '%T@ %p\\n' | sort -nr | tee \"$artifact_list\" >&2; ",
            "wasm_path=\"$(sed -n '1s/^[^ ]* //p' \"$artifact_list\")\"; ",
            "fi; ",
            "[ -n \"$wasm_path\" ] && [ -f \"$wasm_path\" ]; ",
            "ls -la \"$wasm_path\"; ",
            "cp \"$wasm_path\" \"/host-tmp/{output_filename}\""
        ),
        command = command,
        target_dir = target_dir,
        expected_wasm_filename = expected_wasm_filename,
        output_filename = output_filename,
    )
}

fn prepare_docker_run(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str,
    build_id: Option<String>,
) -> Result<PreparedDockerRun, String> {
    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let project = tmp.path().join("project");
    fs::create_dir(&project).map_err(|e| e.to_string())?;

    // Validate main code content
    if !is_safe_file_content(&code) {
        return Err("Unsafe code content detected in main file".to_string());
    }

    // Extract contract name from lib.rs code
    //let contract_name = extract_contract_name(&code).unwrap_or_else(|| "project".to_string());
    let contract_name = extract_contract_name(&code).unwrap_or_else(|| {
        eprintln!("Warning: Could not extract contract name from code, using 'project'");
        "project".to_string()
    });
    eprintln!("Contract name extracted: {}", contract_name);

    let files_map = files.ok_or_else(|| "Files are required but not provided".to_string())?;
    let custom_cargo = files_map
        .get("Cargo.toml")
        .ok_or_else(|| "Cargo.toml file is required but not provided".to_string())?;

    if !is_safe_file_content(custom_cargo) {
        return Err("Unsafe content detected in Cargo.toml".to_string());
    }

    let package_name = to_snake_case(&contract_name);
    eprintln!("Setting package name in Cargo.toml: {}", package_name);
    let updated_cargo = custom_cargo.replace(
        "name = \"project\"",
        &format!("name = \"{}\"", package_name),
    );
    write_project_file(&project, "Cargo.toml", &updated_cargo)?;

    let mut filenames: Vec<_> = files_map.keys().cloned().collect();
    filenames.sort();

    for filename in filenames {
        if filename == "Cargo.toml" || filename == "Cargo.lock" || filename.ends_with("/Cargo.lock")
        {
            continue;
        }

        let content = files_map
            .get(&filename)
            .ok_or_else(|| format!("Missing content for {}", filename))?;

        if !is_safe_file_content(content) {
            return Err(format!("Unsafe content detected in file: {}", filename));
        }

        let target_path = legacy_workspace_path(&filename, &files_map);
        write_project_file(&project, &target_path, content)?;
    }

    // Use build_id to create unique target directory and output filename if provided
    let (target_dir, output_filename) = if let Some(id) = build_id {
        (
            format!("/mnt/cargo/target-{}", &id[..12]), // Use first 12 chars of hash
            format!("{}-{}.wasm", contract_name, &id[..8]), // Use contract name and first 8 chars of hash
        )
    } else {
        (
            "/mnt/cargo/target".to_string(),
            format!("{}.wasm", contract_name),
        )
    };

    let mut final_command =
        with_rustup_bootstrap(&format!("cd /workspace/project && {}", command), false);
    if command.contains("build") {
        // Prefer the conventional contract-name artifact, then fall back to
        // the path reported by `stellar contract build`, then probe the
        // release directory for the newest wasm artifact.
        let wasm_filename = to_snake_case(&contract_name);
        eprintln!("Expected WASM file: {}.wasm", wasm_filename);
        eprintln!("Target directory: {}", target_dir);
        final_command = with_rustup_bootstrap(
            &build_wasm_copy_command(command, &target_dir, &wasm_filename, &output_filename),
            true,
        )
    }

    Ok(PreparedDockerRun {
        tmp,
        final_command,
        output_filename,
        target_dir,
    })
}

pub async fn run_in_docker_no_files(command: &str) -> Result<(Vec<u8>, TempDir), String> {
    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let final_command = with_rustup_bootstrap(command, false);

    let output = tokio::process::Command::new("docker")
        .args([
            "run",
            "--rm",
            "--memory=2G",
            "--cpus=2",
            "-v",
            &format!("{}:/workspace", tmp.path().display()),
            "-v",
            "cargo-cache:/mnt/cargo",
            "-e",
            "CARGO_HOME=/mnt/cargo",
            "wasm_sandbox:latest",
            "bash",
            "-c",
            &final_command,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let mut combined_output = output.stdout;
    if !output.stderr.is_empty() {
        combined_output.extend_from_slice(&output.stderr);
    }

    if !output.status.success() {
        return Err(format!(
            "Docker exited with status: {}\n{}",
            output.status,
            String::from_utf8_lossy(&combined_output)
        ));
    }

    Ok((combined_output, tmp))
}

#[allow(dead_code)]
pub async fn run_in_docker_with_files(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str,
) -> Result<(Vec<u8>, TempDir, String), String> {
    run_in_docker_with_files_and_id(code, files, command, None).await
}

#[allow(dead_code)]
pub async fn run_in_docker_with_files_and_id(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str,
    build_id: Option<String>,
) -> Result<(Vec<u8>, TempDir, String), String> {
    let prepared = prepare_docker_run(code, files, command, build_id)?;
    let output = tokio::process::Command::new("docker")
        .args([
            "run",
            "--rm",
            "--memory=2G",
            "--cpus=2",
            "-v",
            &format!("{}:/workspace", prepared.tmp.path().display()),
            "-v",
            "cargo-cache:/mnt/cargo",
            "-v",
            "/tmp:/host-tmp",
            "-e",
            "CARGO_HOME=/mnt/cargo",
            "-e",
            &format!("CARGO_TARGET_DIR={}", prepared.target_dir),
            "wasm_sandbox:latest",
            "bash",
            "-c",
            &prepared.final_command,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let mut combined_output = output.stdout;
    if !output.stderr.is_empty() {
        combined_output.extend_from_slice(&output.stderr);
    }

    if !output.status.success() {
        return Err(format!(
            "Docker exited with status: {}\n{}",
            output.status,
            String::from_utf8_lossy(&combined_output)
        ));
    }

    Ok((combined_output, prepared.tmp, prepared.output_filename))
}

async fn stream_pipe<R>(mut reader: R, tx: mpsc::UnboundedSender<Bytes>) -> Result<(), String>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buf = [0u8; 4096];
    loop {
        let size = reader.read(&mut buf).await.map_err(|e| e.to_string())?;
        if size == 0 {
            break;
        }
        if tx.send(Bytes::copy_from_slice(&buf[..size])).is_err() {
            break;
        }
    }
    Ok(())
}

pub async fn run_in_docker_with_files_and_id_stream(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str,
    build_id: Option<String>,
    tx: mpsc::UnboundedSender<Bytes>,
) -> Result<(TempDir, String), String> {
    let prepared = prepare_docker_run(code, files, command, build_id)?;

    let mut child = tokio::process::Command::new("docker")
        .args([
            "run",
            "--rm",
            "--memory=2G",
            "--cpus=2",
            "-v",
            &format!("{}:/workspace", prepared.tmp.path().display()),
            "-v",
            "cargo-cache:/mnt/cargo",
            "-v",
            "/tmp:/host-tmp",
            "-e",
            "CARGO_HOME=/mnt/cargo",
            "-e",
            &format!("CARGO_TARGET_DIR={}", prepared.target_dir),
            "wasm_sandbox:latest",
            "bash",
            "-c",
            &prepared.final_command,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let stdout_task = tokio::spawn(stream_pipe(stdout, tx.clone()));
    let stderr_task = tokio::spawn(stream_pipe(stderr, tx.clone()));

    let status = child.wait().await.map_err(|e| e.to_string())?;

    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if !status.success() {
        return Err(format!("Docker exited with status: {}", status));
    }

    Ok((prepared.tmp, prepared.output_filename))
}
