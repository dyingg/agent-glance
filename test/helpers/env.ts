import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FreshEnv = NodeJS.ProcessEnv & {
  AGENT_GLANCE_SOCKET: string;
  AGENT_GLANCE_PIDFILE: string;
  AGENT_GLANCE_IDLE_MS: string;
  __tmpDir: string;
};

export function freshEnv(overrides: Partial<FreshEnv> = {}): FreshEnv {
  const dir = mkdtempSync(join(tmpdir(), "agent-glance-"));
  return {
    ...process.env,
    AGENT_GLANCE_SOCKET: join(dir, "daemon.sock"),
    AGENT_GLANCE_PIDFILE: join(dir, "daemon.pid"),
    AGENT_GLANCE_IDLE_MS: "60000",
    // Safety rail: tests never touch the user's menu bar.
    AGENT_GLANCE_STATUS_DISABLED: "1",
    __tmpDir: dir,
    ...overrides,
  } as FreshEnv;
}

export function cleanupEnv(env: FreshEnv): void {
  try {
    rmSync(env.__tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
