import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cleanupEnv, freshEnv, type FreshEnv } from "./helpers/env.js";
import { readDaemonPid, sleep, waitForProcessExit } from "./helpers/spawn.js";

const ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("end-to-end MCP over stdio", () => {
  let env: FreshEnv;

  beforeEach(() => {
    env = freshEnv({ CLAWD_DOCKLET_IDLE_MS: "300" });
  });

  afterEach(async () => {
    // Wait for daemon to clear after adapter exits; best-effort cleanup.
    try {
      const pid = readDaemonPid(env);
      await waitForProcessExit(pid, 2000).catch(() => {});
    } catch {
      // no daemon spun up
    }
    cleanupEnv(env);
  });

  test("initialize handshake advertises docket_show tool", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [ENTRY],
      env: env as NodeJS.ProcessEnv as Record<string, string>,
    });
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });

    await client.connect(transport);
    const info = client.getServerVersion();
    expect(info?.name).toBe("clawd-docklet");
    expect(info?.version).toBe("0.0.1");

    const caps = client.getServerCapabilities();
    expect(caps?.tools).toBeDefined();

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("docket_show");

    await client.close();
  });

  test("calling docket_show forwards to the daemon and returns ok", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [ENTRY],
      env: env as NodeJS.ProcessEnv as Record<string, string>,
    });
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);

    const result = await client.callTool({
      name: "docket_show",
      arguments: { html: "<h1>hello</h1>", title: "greet" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toBe("ok");

    await client.close();
  });

  test("two adapters share one daemon", async () => {
    const open = async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [ENTRY],
        env: env as NodeJS.ProcessEnv as Record<string, string>,
      });
      const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
      await client.connect(transport);
      return client;
    };

    const a = await open();
    // Give the first adapter time to write the pidfile.
    await sleep(100);
    const pid1 = readDaemonPid(env);

    const b = await open();
    await sleep(100);
    const pid2 = readDaemonPid(env);

    expect(pid1).toBe(pid2);

    await a.close();
    await b.close();
  });
});
