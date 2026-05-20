---
title: Share and Import Projects
description: Move code into and out of SoroPG workspaces.
---

SoroPG supports several ways to move code between your local machine, GitHub, and browser storage.

## Import from GitHub

Use the GitHub import control in the Workspaces panel. Paste a GitHub repository, folder, or file URL. SoroPG reads the GitHub contents and creates or updates a workspace from those files.

Example:

```text
https://github.com/stellar/soroban-examples/tree/main/auth
```

GitHub import works best when the selected path contains a complete contract project or a folder with `Cargo.toml` and `src/lib.rs`.

## Shared links

The Settings panel can create a share link from a GitHub or Gist URL. The link can be opened in SoroPG to import code into a workspace.

## Upload files and folders

Use the upload buttons or drag files into the drop zone. Folder upload preserves relative file paths where the browser provides them.

## ZIP import and export

Download a workspace ZIP when you need a backup or want to move the project to another environment. Upload a ZIP to restore a project into SoroPG.

ZIP export includes the active workspace files only. It does not include generated wallet keys, browser settings, build cache, or deployed contract IDs unless you saved those details in project files.

## Recommended workflow

Use SoroPG for fast iteration, but keep important contracts in a Git repository. Before a serious deployment, export the workspace and run tests in your normal development workflow too.
