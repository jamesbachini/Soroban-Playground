---
title: Workspaces
description: Manage multi-file Soroban projects in SoroPG.
---

Workspaces are local browser projects. Each workspace stores its own files, name, source metadata, updated timestamp, and last open file.

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

Rename a workspace by selecting its name in the workspace list. Workspace names are only local labels; they do not change contract names or package metadata.

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

## Replace or merge files

Uploading files, folders, GitHub paths, or ZIPs can merge files into the active workspace or create a new workspace depending on the flow you choose. Check the file tree after import to make sure `Cargo.toml` and `src/lib.rs` are at the expected level.

If an imported repository has an extra top-level folder, SoroPG strips common leading directories where possible so the contract project opens at the workspace root.

## Tabs

SoroPG opens useful files first: `Cargo.toml`, `src/lib.rs`, and `src/test.rs`. You can open more files from the file tree, close tabs, and switch between files without leaving the workspace.

The editor saves the current file before build, test, audit, import, and workspace operations, but it is still worth switching tabs once after large edits to confirm the file tree state is what you expect.

## Persistence

Workspace data is saved to browser local storage. It is private to your browser profile and device. Download a ZIP when you need a portable backup.

Use ZIP export before clearing browser data, changing browsers, or working in a private window. Browser storage is not a source-control system.
