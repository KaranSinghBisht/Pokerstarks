#!/usr/bin/env node
/**
 * Patches @fatsolutions/tongo-sdk dist/provers/*.js files that incorrectly
 * reference "../../src/utils" instead of "../utils". This is a packaging bug
 * in the SDK where compiled JS files retain paths to the TypeScript source.
 *
 * Run automatically via the "postinstall" npm script.
 */
const fs = require("fs");
const path = require("path");

const proversDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "@fatsolutions",
  "tongo-sdk",
  "dist",
  "provers",
);

if (!fs.existsSync(proversDir)) {
  console.log("[patch-tongo-sdk] SDK not installed yet, skipping.");
  process.exit(0);
}

let patched = 0;
for (const file of fs.readdirSync(proversDir)) {
  if (!file.endsWith(".js")) continue;
  const filePath = path.join(proversDir, file);
  let content = fs.readFileSync(filePath, "utf-8");
  if (content.includes("../../src/utils")) {
    content = content.replace(/require\("\.\.\/\.\.\/src\/utils"\)/g, 'require("../utils")');
    fs.writeFileSync(filePath, content, "utf-8");
    patched++;
  }
}

if (patched > 0) {
  console.log(`[patch-tongo-sdk] Patched ${patched} prover files (../../src/utils → ../utils).`);
} else {
  console.log("[patch-tongo-sdk] No files needed patching.");
}
