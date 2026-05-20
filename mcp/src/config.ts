import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SoropgMcpConfig {
  apiUrl: string;
  apiKey: string;
  projectId?: string;
}

interface FileConfig {
  apiUrl?: string;
  apiKey?: string;
  projectId?: string;
}

function readConfigFile(): FileConfig {
  const explicitPath = process.env.SOROPG_CONFIG;
  const configPath = explicitPath || join(homedir(), ".config", "soropg-mcp", "config.json");
  if (!existsSync(configPath)) return {};

  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as FileConfig;
  } catch (error) {
    throw new Error(`Failed to read SoroPG MCP config at ${configPath}: ${(error as Error).message}`);
  }
}

function normalizeApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error("SOROPG_API_URL must start with http:// or https://");
  }
  return trimmed;
}

export function loadConfig(): SoropgMcpConfig {
  const fileConfig = readConfigFile();
  const apiUrl = process.env.SOROPG_API_URL || fileConfig.apiUrl || "https://soropg.com";
  const apiKey = process.env.SOROPG_API_KEY || fileConfig.apiKey;
  const projectId = process.env.SOROPG_PROJECT_ID || fileConfig.projectId;

  if (!apiKey || apiKey.trim().length < 32) {
    throw new Error("Set SOROPG_API_KEY or ~/.config/soropg-mcp/config.json apiKey from the SoroPG AI / MCP settings panel.");
  }

  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey: apiKey.trim(),
    projectId: projectId?.trim() || undefined,
  };
}
