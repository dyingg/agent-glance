#!/usr/bin/env node
// Apply the glimpseui positioning fix (x/y arg formatting) to the
// installed node_modules/glimpseui/src/glimpse.mjs. Idempotent — a
// second run is a no-op.
//
// This replaces the `patch-package` postinstall approach, which
// fails when agent-glance ships as a dependency: patch-package
// looks for `./node_modules/glimpseui/` relative to its own dir,
// but npm flattens glimpseui to the top-level node_modules, so
// the patch never lands. `require.resolve` walks the resolution
// tree the way Node actually loads the module.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const OLD_X = "if (options.x != null) args.push(`--x=${options.x}`);";
const NEW_X = "if (options.x != null) args.push('--x', String(options.x));";
const OLD_Y = "if (options.y != null) args.push(`--y=${options.y}`);";
const NEW_Y = "if (options.y != null) args.push('--y', String(options.y));";

function apply() {
  const require = createRequire(import.meta.url);
  // glimpseui's package.json `exports` blocks subpath resolution, so resolve
  // the main entry (which is src/glimpse.mjs) rather than the subpath.
  const target = require.resolve("glimpseui");
  let src = readFileSync(target, "utf8");
  if (!src.includes(OLD_X) && !src.includes(OLD_Y)) {
    // Already patched or upstream fixed — nothing to do.
    return;
  }
  src = src.replace(OLD_X, NEW_X).replace(OLD_Y, NEW_Y);
  writeFileSync(target, src);
  console.log("[agent-glance] applied glimpseui x/y positioning fix");
}

try {
  apply();
} catch (err) {
  // Don't fail install — just warn. The HUD will still function; x/y
  // positioning may be off until upstream lands the fix.
  console.warn(
    "[agent-glance] postinstall: could not apply glimpseui patch:",
    err instanceof Error ? err.message : err
  );
}
