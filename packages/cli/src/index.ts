#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { readJsonFile } from "@origin-studio/core";
import { loadSchemaRegistry } from "@origin-studio/origin-creator-adapter";
import { loadProfile } from "@origin-studio/profiles";
import { findBrokenReferences, indexProject } from "@origin-studio/project-indexer";
import { explainDiagnostic, validateFile, validateProject } from "@origin-studio/validator";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const schemaDir = path.join(repoRoot, "schemas", "origin-creator-schemas");

async function main(): Promise<void> {
  const [command, target, extra] = process.argv.slice(2);

  switch (command) {
    case "open":
      print(`Open the web UI at http://localhost:5173 after starting \`pnpm dev\`.`);
      print(`Requested project: ${path.resolve(target ?? ".")}`);
      return;
    case "validate":
      return runValidate(path.resolve(target ?? "."));
    case "validate-file":
      return runValidateFile(path.resolve(target ?? "."));
    case "index":
      return runIndex(path.resolve(target ?? "."));
    case "doctor":
      return runDoctor(path.resolve(target ?? "."));
    case "explain":
      print(explainDiagnostic(target ?? ""));
      return;
    case "schemas":
      if (target === "sync") return syncSchemas();
      if (target === "status") return showSchemaStatus();
      break;
    default:
      printHelp();
      return;
  }

  if (extra) {
    print(extra);
  }
}

async function runValidate(projectRoot: string): Promise<void> {
  const index = await indexProject(projectRoot);
  const registry = await loadSchemaRegistry(schemaDir);
  await loadProfile(projectRoot);
  const diagnostics = await validateProject({ index, registry });

  if (diagnostics.length === 0) {
    print("No diagnostics found.");
    return;
  }

  for (const diagnostic of diagnostics) {
    print(`${diagnostic.severity.toUpperCase()} ${relative(projectRoot, diagnostic.filePath)}`);
    print(`[${diagnostic.id}]`);
    print(diagnostic.message);
    if (diagnostic.suggestion) print(diagnostic.suggestion);
    print("");
  }

  process.exitCode = diagnostics.some((item) => item.severity === "error") ? 1 : 0;
}

async function runValidateFile(filePath: string): Promise<void> {
  const projectRoot = findProjectRoot(filePath);
  const index = await indexProject(projectRoot);
  const registry = await loadSchemaRegistry(schemaDir);
  const diagnostics = await validateFile(filePath, { index, registry });

  if (diagnostics.length === 0) {
    print("No diagnostics found.");
    return;
  }

  for (const diagnostic of diagnostics) {
    print(`${diagnostic.severity.toUpperCase()} ${relative(projectRoot, diagnostic.filePath)}`);
    print(`[${diagnostic.id}]`);
    print(diagnostic.message);
    print("");
  }
}

async function runIndex(projectRoot: string): Promise<void> {
  const index = await indexProject(projectRoot);
  const summary = {
    namespaces: index.namespaces,
    counts: countByKind(index.entries),
    brokenReferences: findBrokenReferences(index).length
  };

  print(JSON.stringify(summary, null, 2));
}

async function runDoctor(projectRoot: string): Promise<void> {
  const index = await indexProject(projectRoot);
  const brokenReferences = findBrokenReferences(index);
  const issues: string[] = [];

  if (index.entries.length === 0) {
    issues.push("No Origins/Apoli files were found under the provided path.");
  }

  if (brokenReferences.length > 0) {
    issues.push(`Found ${brokenReferences.length} broken references.`);
  }

  const samplePackMeta = path.join(projectRoot, "pack.mcmeta");
  try {
    await access(samplePackMeta, constants.F_OK);
  } catch {
    issues.push("pack.mcmeta was not found at the project root.");
  }

  if (issues.length === 0) {
    print("Doctor check passed.");
    return;
  }

  for (const issue of issues) print(`- ${issue}`);
  process.exitCode = 1;
}

async function syncSchemas(): Promise<void> {
  await mkdir(path.dirname(schemaDir), { recursive: true });
  const gitDir = path.join(schemaDir, ".git");
  const exists = await statSafe(gitDir);
  const command = exists
    ? ["-C", schemaDir, "pull", "--ff-only"]
    : ["clone", "https://github.com/mathgeniuszach/origin-creator-schemas.git", schemaDir];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", command, { stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git exited with code ${code}`));
    });
  });

  const head = await readGitHead();
  await writeFile(path.join(schemaDir, ".origin-studio-version.json"), JSON.stringify(head, null, 2));
  print(`Schemas synced to ${schemaDir}`);
}

async function showSchemaStatus(): Promise<void> {
  const versionFile = path.join(schemaDir, ".origin-studio-version.json");
  try {
    const content = await readFile(versionFile, "utf8");
    print(content);
  } catch {
    print("Schemas not synced yet. Run `origin-studio schemas sync`.");
    process.exitCode = 1;
  }
}

async function readGitHead(): Promise<Record<string, string>> {
  const headFile = path.join(schemaDir, ".git", "HEAD");
  const head = await readFile(headFile, "utf8");
  return { syncedAt: new Date().toISOString(), head: head.trim() };
}

function findProjectRoot(filePath: string): string {
  const parts = filePath.split(path.sep);
  const dataIndex = parts.lastIndexOf("data");
  if (dataIndex <= 0) return path.dirname(filePath);
  return parts.slice(0, dataIndex).join(path.sep);
}

function countByKind(entries: Array<{ kind: string }>): Record<string, number> {
  return entries.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.kind] = (accumulator[entry.kind] ?? 0) + 1;
    return accumulator;
  }, {});
}

async function statSafe(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

function printHelp(): void {
  print(`origin-studio open <path>`);
  print(`origin-studio validate <path>`);
  print(`origin-studio validate-file <file>`);
  print(`origin-studio index <path>`);
  print(`origin-studio doctor <path>`);
  print(`origin-studio explain <diagnostic-id>`);
  print(`origin-studio schemas sync`);
  print(`origin-studio schemas status`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
