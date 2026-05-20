import type { SoropgMcpConfig } from "./config.js";

export interface ProjectSummary {
  id: string;
  name: string;
  files: number;
  revision: number;
  updatedAt: number;
  lastOpenFile?: string | null;
  active: boolean;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  files: Record<string, string>;
  revision: number;
  updatedAt: number;
  lastOpenFile?: string | null;
}

export interface FileEntry {
  path: string;
  size: number;
}

export interface FileContent {
  path: string;
  content: string;
  revision: number;
}

export interface MutationResponse {
  ok: boolean;
  revision: number;
  seq: number;
}

export interface CommandResponse {
  ok: boolean;
  command: string;
  output: string;
  revision: number;
}

type FetchLike = typeof fetch;

export class IdeClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: SoropgMcpConfig, fetchImpl: FetchLike = fetch) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetchImpl = fetchImpl;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.request<ProjectSummary[]>("/api/mcp/v1/projects");
  }

  async getProject(projectId: string): Promise<ProjectSnapshot> {
    return this.request<ProjectSnapshot>(`/api/mcp/v1/projects/${encodeURIComponent(projectId)}`);
  }

  async listFiles(projectId: string): Promise<FileEntry[]> {
    return this.request<FileEntry[]>(`/api/mcp/v1/projects/${encodeURIComponent(projectId)}/files`);
  }

  async readFile(projectId: string, path: string): Promise<FileContent> {
    return this.request<FileContent>(
      `/api/mcp/v1/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`,
    );
  }

  async createFile(projectId: string, path: string, content: string): Promise<MutationResponse> {
    return this.request<MutationResponse>(`/api/mcp/v1/projects/${encodeURIComponent(projectId)}/file`, {
      method: "POST",
      body: JSON.stringify({ path, content, mode: "create" }),
    });
  }

  async replaceFile(projectId: string, path: string, content: string): Promise<MutationResponse> {
    return this.request<MutationResponse>(`/api/mcp/v1/projects/${encodeURIComponent(projectId)}/file`, {
      method: "POST",
      body: JSON.stringify({ path, content, mode: "replace" }),
    });
  }

  async deleteFile(projectId: string, path: string): Promise<MutationResponse> {
    return this.request<MutationResponse>(
      `/api/mcp/v1/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    );
  }

  async moveFile(projectId: string, fromPath: string, toPath: string): Promise<MutationResponse> {
    return this.request<MutationResponse>(`/api/mcp/v1/projects/${encodeURIComponent(projectId)}/move`, {
      method: "POST",
      body: JSON.stringify({ fromPath, toPath }),
    });
  }

  async runCommand(projectId: string, command: string): Promise<CommandResponse> {
    return this.request<CommandResponse>(`/api/mcp/v1/projects/${encodeURIComponent(projectId)}/commands`, {
      method: "POST",
      body: JSON.stringify({ command }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = errorMessage(payload) || text || `SoroPG API failed with ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  }
}

function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  return null;
}
