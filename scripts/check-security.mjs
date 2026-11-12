import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Script } from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const update = process.argv.includes("--fix");
const pages = readdirSync(root).filter(name => name.endsWith(".html")).sort();
const errors = [];
let changed = 0;

function record(message) {
  errors.push(message);
  console.error("ERROR:", message);
}
function scriptHashes(html, filename) {
  const matches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]) && match[2].trim());
  return matches.map((match, index) => {
    try {
      new Script(match[2], { filename: filename + ":inline-" + (index + 1) });
    } catch (error) {
      record(filename + ": inline script parse failed: " + error.message);
    }
    return "'sha256-" + createHash("sha256").update(match[2], "utf8").digest("base64") + "'";
  });
}
for (const filename of pages) {
  const location = path.join(root, filename);
  const html = readFileSync(location, "utf8");
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)">/i);
  if (!meta) {
    record(filename + ": missing CSP meta tag");
    continue;
  }
  if (/\son(?:click|load|error|input|change|submit)\s*=/.test(html)) {
    record(filename + ": inline HTML event handler is forbidden");
  }
  const hashes = scriptHashes(html, filename);
  const scriptSource = /(?:^|;)\s*script-src\s+([^;]+)/.exec(meta[1]);
  if (!scriptSource) {
    record(filename + ": no script-src directive");
    continue;
  }
  if (/unsafe-inline|unsafe-eval/.test(scriptSource[1])) {
    record(filename + ": script-src must not permit unsafe-inline or unsafe-eval");
  }
  const existing = scriptSource[1].match(/'sha256-[A-Za-z0-9+/=]+'/g) || [];
  if (update) {
    const safeSources = scriptSource[1].replace(/'sha256-[A-Za-z0-9+/=]+'/g, "").trim();
    const next = (safeSources + " " + hashes.join(" ")).trim().replace(/\s+/g, " ");
    const revisedPolicy = meta[1].replace(scriptSource[0], scriptSource[0].replace(scriptSource[1], " " + next));
    const revised = html.replace(meta[0], meta[0].replace(meta[1], revisedPolicy));
    if (revised !== html) {
      writeFileSync(location, revised);
      changed++;
    }
  } else if (existing.length !== hashes.length || existing.some((hash, index) => hash !== hashes[index])) {
    record(filename + ": CSP SHA-256 hashes do not match embedded scripts; run node scripts/check-security.mjs --fix");
  }
}
for (const filename of ["entur-slide.js", "kiosk-auto-reload.js", "klubben-contact.js", "signage-video.js", "films-landscape-runtime.js", "arrangements-landscape-runtime.js", "landscape-all-runtime.js", "status-runtime.js", "apps-script/InfoskjermenConfigService.gs"]) {
  try {
    new Script(readFileSync(path.join(root, filename), "utf8"), { filename });
  } catch (error) {
    record(filename + ": JavaScript parse failed: " + error.message);
  }
}
if (errors.length) {
  console.error("Security checks failed (" + errors.length + ").");
  process.exitCode = 1;
} else {
  console.log(update ? "CSP hashes refreshed in " + changed + " page(s)." : "Security checks passed for " + pages.length + " HTML pages and shared scripts.");
}
// Routine maintenance
