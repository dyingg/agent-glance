#!/usr/bin/env node
// Apply agent-glance's local glimpseui compatibility patches to the installed
// dependency. Idempotent: a second run only rebuilds the native host if the
// Swift source is patched but the local build marker is missing.
//
// This replaces the `patch-package` postinstall approach, which
// fails when agent-glance ships as a dependency: patch-package
// looks for `./node_modules/glimpseui/` relative to its own dir,
// but npm flattens glimpseui to the top-level node_modules, so
// the patch never lands. `require.resolve` walks the resolution
// tree the way Node actually loads the module.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const OLD_X = "if (options.x != null) args.push(`--x=${options.x}`);";
const NEW_X = "if (options.x != null) args.push('--x', String(options.x));";
const OLD_Y = "if (options.y != null) args.push(`--y=${options.y}`);";
const NEW_Y = "if (options.y != null) args.push('--y', String(options.y));";

const AUTO_CLOSE_LINE = "  if (options.autoClose)    args.push('--auto-close');";
const HOVER_FADE_MJS = `${AUTO_CLOSE_LINE}

  const supportsFadeOnHover = host.platform === 'darwin' || host.platform === 'override';
  if (options.fadeOnHover && supportsFadeOnHover) {
    args.push('--fade-on-hover');
    if (options.fadeOnHoverOpacity != null) args.push('--fade-on-hover-opacity', String(options.fadeOnHoverOpacity));
    if (options.fadeOnHoverDuration != null) args.push('--fade-on-hover-duration', String(options.fadeOnHoverDuration));
  } else if (options.fadeOnHover) {
    process.emitWarning('fadeOnHover is only supported by the macOS Glimpse host', { code: 'GLIMPSE_FADE_ON_HOVER_UNSUPPORTED' });
  }`;

const SWIFT_CONFIG_LINE = "    var noDock: Bool = false";
const SWIFT_CONFIG_PATCH = `${SWIFT_CONFIG_LINE}
    var fadeOnHover: Bool = false
    var fadeOnHoverOpacity: Double = 0.0
    var fadeOnHoverDuration: Double = 0.16`;

const SWIFT_PARSE_NO_DOCK = `        case "--no-dock":
            config.noDock = true`;
const SWIFT_PARSE_HOVER_FADE = `${SWIFT_PARSE_NO_DOCK}
        case "--fade-on-hover":
            config.fadeOnHover = true
        case "--fade-on-hover-opacity":
            i += 1
            if i < args.count, let v = Double(args[i]) { config.fadeOnHoverOpacity = min(1.0, max(0.0, v)) }
        case "--fade-on-hover-duration":
            i += 1
            if i < args.count, let v = Double(args[i]) { config.fadeOnHoverDuration = max(0.0, v) }`;

const SWIFT_SPRING_LINE = "    let springSettleThreshold: CGFloat = 0.5";
const SWIFT_HOVER_STATE = `${SWIFT_SPRING_LINE}

    // Hover fade state. This lives outside the agent HTML and is controlled
    // by the native host, so write_glance/edit_glance content cannot affect it.
    var hoverFadeGlobalMouseMonitor: Any?
    var hoverFadeLocalMouseMonitor: Any?
    var isHoverFaded: Bool = false`;

const SWIFT_SETUP_WEBVIEW = `            setupWindow()
            setupWebView()`;
const SWIFT_SETUP_WEBVIEW_WITH_HOVER = `${SWIFT_SETUP_WEBVIEW}
            if config.fadeOnHover {
                startHoverFade()
            }`;

const SWIFT_FOLLOW_MOVE = `            } else {
                self.window.setFrameOrigin(target)
            }`;
const SWIFT_FOLLOW_MOVE_WITH_HOVER = `            } else {
                self.window.setFrameOrigin(target)
            }
            self.updateHoverFade(mouse: NSEvent.mouseLocation)`;

const SWIFT_SPRING_MOVE = "        window.setFrameOrigin(NSPoint(x: springPosX, y: springPosY))";
const SWIFT_SPRING_MOVE_WITH_HOVER = `${SWIFT_SPRING_MOVE}
        updateHoverFade(mouse: NSEvent.mouseLocation)`;

const SWIFT_SHOW_ORDER = `                window.makeKeyAndOrderFront(nil)
                window.makeFirstResponder(webView)
                NSApp.activate(ignoringOtherApps: true)`;
const SWIFT_SHOW_ORDER_WITH_HOVER = `${SWIFT_SHOW_ORDER}
                updateHoverFade(mouse: NSEvent.mouseLocation)`;

const SWIFT_STOP_FOLLOWING_CURSOR = `    func stopFollowingCursor() {
        if let monitor = globalMouseMonitor {
            NSEvent.removeMonitor(monitor)
            globalMouseMonitor = nil
        }
        if let monitor = localMouseMonitor {
            NSEvent.removeMonitor(monitor)
            localMouseMonitor = nil
        }
        // Cancel spring timer — must resume before cancel if suspended
        if let timer = springTimer {
            if springTimerSuspended {
                timer.resume()
            }
            timer.cancel()
            springTimer = nil
            springTimerSuspended = true
        }
    }`;
const SWIFT_HOVER_METHODS = `${SWIFT_STOP_FOLLOWING_CURSOR}

    // MARK: - Hover Fade

    func startHoverFade() {
        guard hoverFadeGlobalMouseMonitor == nil else { return }
        updateHoverFade(mouse: NSEvent.mouseLocation)
        let moveHandler: (NSEvent) -> Void = { [weak self] _ in
            guard let self else { return }
            self.updateHoverFade(mouse: NSEvent.mouseLocation)
        }
        hoverFadeGlobalMouseMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDragged, .rightMouseDragged],
            handler: moveHandler
        )
        hoverFadeLocalMouseMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDragged, .rightMouseDragged]
        ) { [weak self] event in
            guard let self else { return event }
            self.updateHoverFade(mouse: NSEvent.mouseLocation)
            return event
        }
    }

    func updateHoverFade(mouse: NSPoint) {
        guard config.fadeOnHover, !config.statusItem, window != nil, !hidden else { return }
        let shouldFade = window.frame.contains(mouse)
        if shouldFade == isHoverFaded { return }
        isHoverFaded = shouldFade
        let targetAlpha: CGFloat = shouldFade ? CGFloat(config.fadeOnHoverOpacity) : 1.0
        NSAnimationContext.runAnimationGroup { context in
            context.duration = config.fadeOnHoverDuration
            window.animator().alphaValue = targetAlpha
        }
    }`;

function replaceOnce(src, oldText, newText) {
  if (!src.includes(oldText)) return { src, changed: false };
  return { src: src.replace(oldText, newText), changed: true };
}

function patchNodeWrapper(target) {
  let src = readFileSync(target, "utf8");
  let changed = false;
  for (const [oldText, newText] of [
    [OLD_X, NEW_X],
    [OLD_Y, NEW_Y],
  ]) {
    const res = replaceOnce(src, oldText, newText);
    src = res.src;
    changed ||= res.changed;
  }
  if (!src.includes("options.fadeOnHover")) {
    const res = replaceOnce(src, AUTO_CLOSE_LINE, HOVER_FADE_MJS);
    src = res.src;
    changed ||= res.changed;
  }
  if (changed) writeFileSync(target, src);
  return changed;
}

function patchSwiftHost(swiftPath) {
  if (!existsSync(swiftPath)) return false;
  let src = readFileSync(swiftPath, "utf8");
  let changed = false;
  const replacements = [
    {
      oldText: SWIFT_CONFIG_LINE,
      newText: SWIFT_CONFIG_PATCH,
      marker: "var fadeOnHover: Bool",
    },
    {
      oldText: SWIFT_PARSE_NO_DOCK,
      newText: SWIFT_PARSE_HOVER_FADE,
      marker: 'case "--fade-on-hover":',
    },
    {
      oldText: SWIFT_SPRING_LINE,
      newText: SWIFT_HOVER_STATE,
      marker: "var hoverFadeGlobalMouseMonitor",
    },
    {
      oldText: SWIFT_SETUP_WEBVIEW,
      newText: SWIFT_SETUP_WEBVIEW_WITH_HOVER,
      marker: SWIFT_SETUP_WEBVIEW_WITH_HOVER,
    },
    {
      oldText: SWIFT_FOLLOW_MOVE,
      newText: SWIFT_FOLLOW_MOVE_WITH_HOVER,
      marker: SWIFT_FOLLOW_MOVE_WITH_HOVER,
    },
    {
      oldText: SWIFT_SPRING_MOVE,
      newText: SWIFT_SPRING_MOVE_WITH_HOVER,
      marker: SWIFT_SPRING_MOVE_WITH_HOVER,
    },
    {
      oldText: SWIFT_SHOW_ORDER,
      newText: SWIFT_SHOW_ORDER_WITH_HOVER,
      marker: SWIFT_SHOW_ORDER_WITH_HOVER,
    },
    {
      oldText: SWIFT_STOP_FOLLOWING_CURSOR,
      newText: SWIFT_HOVER_METHODS,
      marker: "func startHoverFade()",
    },
  ];
  for (const { oldText, newText, marker } of replacements) {
    if (src.includes(marker)) continue;
    const res = replaceOnce(src, oldText, newText);
    src = res.src;
    changed ||= res.changed;
  }
  if (changed) writeFileSync(swiftPath, src);
  return changed;
}

function rebuildSwiftHost(srcDir) {
  if (process.platform !== "darwin") return;
  const swiftPath = join(srcDir, "glimpse.swift");
  const binaryPath = join(srcDir, "glimpse");
  const markerPath = join(srcDir, ".agent-glance-hover-fade-built");
  const moduleCachePath = join(tmpdir(), "agent-glance-swift-module-cache");
  mkdirSync(moduleCachePath, { recursive: true });
  const result = spawnSync(
    "swiftc",
    ["-O", "-module-cache-path", moduleCachePath, swiftPath, "-o", binaryPath],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH: moduleCachePath,
        SWIFT_MODULE_CACHE_PATH: moduleCachePath,
      },
    }
  );
  if (result.error || result.status !== 0) {
    const message = result.error
      ? result.error.message
      : `swiftc exited with ${result.status}`;
    console.warn(
      "[agent-glance] postinstall: patched Glimpse Swift source but could not rebuild native host:",
      message
    );
    return;
  }
  writeFileSync(markerPath, "ok\n");
}

function swiftNeedsRebuild(srcDir) {
  const swiftPath = join(srcDir, "glimpse.swift");
  const markerPath = join(srcDir, ".agent-glance-hover-fade-built");
  return (
    process.platform === "darwin" &&
    existsSync(swiftPath) &&
    readFileSync(swiftPath, "utf8").includes("fadeOnHover") &&
    !existsSync(markerPath)
  );
}

function apply() {
  const require = createRequire(import.meta.url);
  // glimpseui's package.json `exports` blocks subpath resolution, so resolve
  // the main entry (which is src/glimpse.mjs) rather than the subpath.
  const target = require.resolve("glimpseui");
  const nodeChanged = patchNodeWrapper(target);
  const srcDir = dirname(target);
  const swiftChanged = patchSwiftHost(join(srcDir, "glimpse.swift"));
  if (nodeChanged || swiftChanged) {
    console.log("[agent-glance] applied glimpseui compatibility patches");
  }
  if (swiftChanged || swiftNeedsRebuild(srcDir)) rebuildSwiftHost(srcDir);
}

try {
  apply();
} catch (err) {
  // Don't fail install. The HUD will still function; native compatibility
  // behaviors may be missing until upstream lands them.
  console.warn(
    "[agent-glance] postinstall: could not apply glimpseui patch:",
    err instanceof Error ? err.message : err
  );
}
