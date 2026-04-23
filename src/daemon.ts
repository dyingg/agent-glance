import { createServer, type Server, type Socket } from "node:net";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { platform } from "node:os";
import { encode, LineDecoder, type Frame, type ReqFrame } from "./protocol.js";
import { resolvePaths, type Paths } from "./paths.js";

type Handler = (params: unknown, ctx: { connId: string }) => Promise<unknown>;

export type Daemon = {
  server: Server;
  close: () => Promise<void>;
  onRequest: (method: string, handler: Handler) => void;
  connections: number;
};

export async function startDaemon(paths: Paths = resolvePaths()): Promise<Daemon> {
  if (platform() !== "win32") {
    mkdirSync(dirname(paths.socketPath), { recursive: true });
    try {
      unlinkSync(paths.socketPath);
    } catch {
      // fine if it doesn't exist
    }
  }

  const handlers = new Map<string, Handler>();
  const conns = new Set<Socket>();
  let idleTimer: NodeJS.Timeout | null = null;

  const server = createServer((sock) => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    conns.add(sock);

    const connId = cryptoRandom();
    const decoder = new LineDecoder();

    sock.on("data", (chunk) => {
      for (const frame of decoder.push(chunk)) {
        if (frame.kind === "req") void dispatch(sock, frame, connId);
      }
    });
    sock.on("close", () => {
      conns.delete(sock);
      if (conns.size === 0) scheduleIdleExit();
    });
    sock.on("error", () => {
      conns.delete(sock);
    });
  });

  async function dispatch(sock: Socket, req: ReqFrame, connId: string) {
    const handler = handlers.get(req.method);
    if (!handler) {
      sock.write(
        encode({ kind: "res", id: req.id, error: { code: -32601, message: `unknown method: ${req.method}` } }),
      );
      return;
    }
    try {
      const result = await handler(req.params, { connId });
      sock.write(encode({ kind: "res", id: req.id, result }));
    } catch (err) {
      sock.write(
        encode({
          kind: "res",
          id: req.id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
        }),
      );
    }
  }

  function scheduleIdleExit() {
    if (idleTimer || paths.idleMs <= 0) return;
    idleTimer = setTimeout(() => {
      server.close(() => process.exit(0));
    }, paths.idleMs);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(paths.socketPath, () => {
      server.off("error", reject);
      writeFileSync(paths.pidfilePath, String(process.pid));
      resolve();
    });
  });

  return {
    server,
    get connections() {
      return conns.size;
    },
    onRequest(method, handler) {
      handlers.set(method, handler);
    },
    close: () =>
      new Promise<void>((resolve) => {
        if (idleTimer) clearTimeout(idleTimer);
        for (const c of conns) c.destroy();
        server.close(() => resolve());
      }),
  };
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type ShowParams = { html: string; title?: string };

export function registerShowHandler(daemon: Pick<Daemon, "onRequest">) {
  daemon.onRequest("show", async (params) => {
    const p = params as Partial<ShowParams> | null;
    if (!p || typeof p.html !== "string") {
      throw new Error("show: 'html' must be a string");
    }
    if (p.title !== undefined && typeof p.title !== "string") {
      throw new Error("show: 'title' must be a string when provided");
    }
    // Daemon→glimpse wiring lands in a later change. Payload is accepted here.
    return { ok: true };
  });
}

export async function runDaemonMain() {
  const paths = resolvePaths();
  try {
    const daemon = await startDaemon(paths);
    daemon.onRequest("ping", async () => ({ ok: true }));
    registerShowHandler(daemon);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EADDRINUSE") {
      // Another daemon won the race. Exit quietly.
      process.exit(0);
    }
    throw err;
  }
}
