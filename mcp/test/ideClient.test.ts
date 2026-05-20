import { describe, expect, it } from "vitest";

import { IdeClient } from "../src/ideClient.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("IdeClient", () => {
  it("sends bearer auth and parses projects", async () => {
    const calls: Request[] = [];
    const client = new IdeClient(
      { apiUrl: "https://soropg.com", apiKey: "x".repeat(40) },
      async (input, init) => {
        calls.push(new Request(input, init));
        return jsonResponse([{ id: "workspace-1", name: "Demo", files: 3, revision: 1, updatedAt: 1, active: true }]);
      },
    );

    const projects = await client.listProjects();

    expect(projects[0].id).toBe("workspace-1");
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${"x".repeat(40)}`);
    expect(calls[0].url).toBe("https://soropg.com/api/mcp/v1/projects");
  });

  it("surfaces API errors", async () => {
    const client = new IdeClient(
      { apiUrl: "https://soropg.com", apiKey: "x".repeat(40) },
      async () => jsonResponse({ error: "Project is not connected" }, 404),
    );

    await expect(client.listFiles("missing")).rejects.toThrow("Project is not connected");
  });

  it("surfaces non-json API errors", async () => {
    const client = new IdeClient(
      { apiUrl: "https://soropg.com", apiKey: "x".repeat(40) },
      async () => new Response("upstream unavailable", { status: 503 }),
    );

    await expect(client.listProjects()).rejects.toThrow("upstream unavailable");
  });
});
