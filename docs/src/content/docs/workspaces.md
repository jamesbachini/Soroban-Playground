---
title: Workspaces
description: Manage multi-file Soroban projects in SoroPG.
---

Workspaces are local browser projects. Each workspace stores its own files, name, source metadata, and last open file.

## Default layout

SoroPG expects a normal Soroban Rust project shape:

```text
Cargo.toml
src/lib.rs
src/test.rs
```

`src/lib.rs` is the primary contract source. If a project uses the older flat layout, SoroPG can also read `lib.rs` and `test.rs`.

## Create a workspace

Use the plus button in the Workspaces panel to create a new default project. SoroPG creates the default files from the templates bundled with the frontend.

## Manage files

The file panel supports:

- Creating files.
- Renaming files.
- Deleting files.
- Uploading individual files.
- Uploading folders.
- Dragging files or folders into the drop zone.
- Uploading a workspace ZIP.
- Downloading the active workspace as a ZIP.

File paths are normalized to use `/`. Paths cannot be empty, cannot include `.` or `..` segments, and must use supported filename characters.

## Tabs

SoroPG opens useful files first: `Cargo.toml`, `src/lib.rs`, and `src/test.rs`. You can open more files from the file tree, close tabs, and switch between files without leaving the workspace.

## Persistence

Workspace data is saved to browser local storage. It is private to your browser profile and device. Download a ZIP when you need a portable backup.
