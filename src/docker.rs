use std::{fs, process::Stdio, collections::HashMap};
use tempfile::TempDir;
use regex::Regex;

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

pub async fn run_in_docker_no_files(command: &str) -> Result<(Vec<u8>, TempDir), String> {
    let tmp = TempDir::new().map_err(|e| e.to_string())?;

    let output = tokio::process::Command::new("docker")
        .args(&[
            "run", "--rm", "--memory=2G", "--cpus=2",
            "-v", &format!("{}:/workspace", tmp.path().display()),
            "-v", "cargo-cache:/mnt/cargo",
            "-e", "CARGO_HOME=/mnt/cargo",
            "wasm_sandbox:latest", "bash", "-c",
            command
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.stdout.is_empty() {
        Ok((output.stdout, tmp))
    } else {
        Ok((output.stderr, tmp))
    }
}

pub async fn run_in_docker_with_files(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str
) -> Result<(Vec<u8>, TempDir, String), String> {
    run_in_docker_with_files_and_id(code, files, command, None).await
}

pub async fn run_in_docker_with_files_and_id(
    code: String,
    files: Option<HashMap<String, String>>,
    command: &str,
    build_id: Option<String>
) -> Result<(Vec<u8>, TempDir, String), String> {
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

    // Handle Cargo.toml - must be provided in files
    if let Some(ref files_map) = files {
        if let Some(custom_cargo) = files_map.get("Cargo.toml") {
            if !is_safe_file_content(custom_cargo) {
                return Err("Unsafe content detected in Cargo.toml".to_string());
            }
            // Update the package name in Cargo.toml to match the contract name
            // Use snake_case for the package name as per Cargo conventions
            let package_name = to_snake_case(&contract_name);
            eprintln!("Setting package name in Cargo.toml: {}", package_name);
            let updated_cargo = custom_cargo.replace("name = \"project\"", &format!("name = \"{}\"", package_name));
            fs::write(project.join("Cargo.toml"), updated_cargo).map_err(|e| e.to_string())?;
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
    // Use build_id to create unique target directory and output filename if provided
    let (target_dir, output_filename) = if let Some(id) = build_id {
        (
            format!("/mnt/cargo/target-{}", &id[..12]), // Use first 12 chars of hash
            format!("{}-{}.wasm", contract_name, &id[..8]) // Use contract name and first 8 chars of hash
        )
    } else {
        (
            "/mnt/cargo/target".to_string(),
            format!("{}.wasm", contract_name)
        )
    };

    let mut final_command = format!("cd /workspace/project && {}", command);
    if command.contains("build") {
        // Cargo produces WASM files with snake_case names, even if the package name is CamelCase
        let wasm_filename = to_snake_case(&contract_name);
        eprintln!("Looking for WASM file: {}.wasm", wasm_filename);
        eprintln!("Target directory: {}", target_dir);
        final_command = format!(
            "set -ex; cd /workspace/project && {} && ls -la {}/wasm32v1-none/release/*.wasm && cp {}/wasm32v1-none/release/{}.wasm /host-tmp/{}",
            command,
            target_dir,
            target_dir,
            wasm_filename,
            output_filename
        )
    }
    let output = tokio::process::Command::new("docker")
        .args(&[
            "run", "--rm", "--memory=2G", "--cpus=2",
            "-v", &format!("{}:/workspace", tmp.path().display()),
            "-v", "cargo-cache:/mnt/cargo",
            "-v", "/tmp:/host-tmp",
            "-e", "CARGO_HOME=/mnt/cargo",
            "-e", &format!("CARGO_TARGET_DIR={}", target_dir),
            "wasm_sandbox:latest", "bash", "-c",
            &final_command
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| e.to_string())?;

    //let stdout = String::from_utf8_lossy(&output.stdout);
    //let stderr = String::from_utf8_lossy(&output.stderr);
    //println!("Docker stdout:\n{}", stdout);
    //println!("Docker stderr:\n{}", stderr);
    if !output.stdout.is_empty() {
        Ok((output.stdout, tmp, output_filename))
    } else {
        Ok((output.stderr, tmp, output_filename))
    }
}
