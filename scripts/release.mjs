#!/usr/bin/env node
/**
 * Usage:  node scripts/release.mjs v1.2.3
 *
 * What it does:
 *  1. Validates the version tag (must be vX.Y.Z)
 *  2. Bumps "version" in all package.json files
 *  3. Commits the changes
 *  4. Creates an annotated git tag
 *  5. Pushes the commit + tag → triggers the release.yml CI workflow
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── helpers ────────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

function bumpPackage(relPath, version) {
  const abs = resolve(root, relPath);
  const pkg = JSON.parse(readFileSync(abs, "utf8"));
  pkg.version = version;
  writeFileSync(abs, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  bumped ${relPath} → ${version}`);
}

// ── main ───────────────────────────────────────────────────────────────────────

const tag = process.argv[2];

if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error("Usage: node scripts/release.mjs v<major>.<minor>.<patch>");
  process.exit(1);
}

const version = tag.replace(/^v/, "");

// Make sure the working tree is clean before we start
try {
  execSync("git diff --quiet && git diff --cached --quiet", {
    cwd: root,
    stdio: "pipe",
  });
} catch {
  console.error(
    "Working tree is not clean. Commit or stash your changes first.",
  );
  process.exit(1);
}

console.log(`\nReleasing ${tag}...\n`);

// 1. Bump all package.json files
bumpPackage("package.json", version);
bumpPackage("desktop/package.json", version);
bumpPackage("mobile/package.json", version);
bumpPackage("packages/shared/package.json", version);

// 2. Commit
run(
  `git add package.json desktop/package.json mobile/package.json packages/shared/package.json`,
);
run(`git commit -m "chore: release ${tag}"`);

// 3. Annotated tag
run(`git tag -a ${tag} -m "Release ${tag}"`);

// 4. Push commit + tag
run(`git push origin master`);
run(`git push origin ${tag}`);

console.log(`\nDone! CI will now:`);
console.log(`  • build the desktop app (Win / macOS / Linux)`);
console.log(`  • build the Android APK`);
console.log(`  • create a GitHub Release with all installers + update manifests`);
