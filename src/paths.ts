import { homedir, platform } from "node:os";
import { join } from "node:path";

export type HudMode = "always" | "lazy";

export type Paths = {
  socketPath: string;
  pidfilePath: string;
  idleMs: number;
  hudMode: HudMode;
  hudDisabled: boolean;
  configPath: string;
  statusDisabled: boolean;
};

function defaultSocketDir(): string {
  const plat = platform();
  if (plat === "darwin") {
    return join(homedir(), "Library", "Application Support", "agent-glance");
  }
  if (plat === "win32") {
    // Named pipes on Windows don't live on the filesystem; pidfile goes in LOCALAPPDATA.
    return process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local", "agent-glance");
  }
  return process.env.XDG_RUNTIME_DIR ?? join(homedir(), ".agent-glance");
}

function defaultSocketPath(): string {
  if (platform() === "win32") return String.raw`\\.\pipe\agent-glance`;
  return join(defaultSocketDir(), "daemon.sock");
}

function defaultPidfilePath(): string {
  return join(defaultSocketDir(), "daemon.pid");
}

function defaultConfigPath(): string {
  return join(defaultSocketDir(), "config.json");
}

function parseHudMode(raw: string | undefined): HudMode {
  if (raw === "lazy") return "lazy";
  return "always";
}

function parseBoolFlag(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

export function resolvePaths(): Paths {
  return {
    socketPath: process.env.AGENT_GLANCE_SOCKET ?? defaultSocketPath(),
    pidfilePath: process.env.AGENT_GLANCE_PIDFILE ?? defaultPidfilePath(),
    idleMs: Number.parseInt(process.env.AGENT_GLANCE_IDLE_MS ?? "30000", 10),
    hudMode: parseHudMode(process.env.AGENT_GLANCE_HUD_MODE),
    hudDisabled: parseBoolFlag(process.env.AGENT_GLANCE_HUD_DISABLED),
    configPath: process.env.AGENT_GLANCE_CONFIG ?? defaultConfigPath(),
    statusDisabled: parseBoolFlag(process.env.AGENT_GLANCE_STATUS_DISABLED),
  };
}
