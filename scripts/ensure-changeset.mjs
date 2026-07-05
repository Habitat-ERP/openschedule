#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.CHANGESET_BASE ?? "origin/main";
const changed = changedFiles(base);

if (await hasChangesetFile() || changed.some((file) => /^\.changeset\/(?!README\.md$).+\.md$/.test(file))) {
  process.exit(0);
}

const packages = await workspacePackages();
const changedPackages = packages
  .filter((pkg) => changed.some((file) => file.startsWith(`${pkg.dir}/`)))
  .map((pkg) => pkg.name)
  .sort();

await mkdir(".changeset", { recursive: true });
const sha = exec("git", ["rev-parse", "--short", "HEAD"]).trim();
const file = join(".changeset", `auto-${sha}.md`);
const frontmatter = changedPackages.length
  ? changedPackages.map((name) => `"${name}": patch`).join("\n")
  : "";
const summary = changedPackages.length
  ? "Automated patch changeset for package changes."
  : "No package release.";

await writeFile(file, `---\n${frontmatter}\n---\n\n${summary}\n`, "utf8");

function changedFiles(ref) {
  for (const range of [`${ref}...HEAD`, `${ref}..HEAD`]) {
    try {
      return exec("git", ["diff", "--name-only", range])
        .split("\n")
        .filter(Boolean);
    } catch {
      // Try the next range form.
    }
  }
  return exec("git", ["diff", "--name-only"]).split("\n").filter(Boolean);
}

async function workspacePackages() {
  const root = "packages";
  const entries = await readdir(root, { withFileTypes: true });
  const packages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = `${root}/${entry.name}`;
    const json = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    if (typeof json.name === "string") packages.push({ dir, name: json.name });
  }
  return packages;
}

async function hasChangesetFile() {
  try {
    const entries = await readdir(".changeset");
    return entries.some((entry) => entry !== "README.md" && entry.endsWith(".md"));
  } catch {
    return false;
  }
}

function exec(command, args) {
  return execFileSync(command, args, { encoding: "utf8" });
}
