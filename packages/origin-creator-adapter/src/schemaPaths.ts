import { readdir, stat } from "node:fs/promises";
import path from "node:path";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function findWorkspaceRoot(start: string): Promise<string> {
  const override = process.env.ORIGIN_STUDIO_ROOT;
  if (override) {
    return path.resolve(override);
  }

  let current = path.resolve(start);

  while (true) {
    if (await pathExists(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }

    current = parent;
  }
}

export async function resolveSchemaDir(repoRoot: string): Promise<string | undefined> {
  const candidates = [
    process.env.ORIGIN_STUDIO_SCHEMA_DIR,
    path.join(repoRoot, "origin-creator-schemas"),
    path.join(repoRoot, "schemas", "origin-creator-schemas")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await isUsableSchemaDir(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function isUsableSchemaDir(candidate: string): Promise<boolean> {
  if (!(await pathExists(candidate))) {
    return false;
  }

  try {
    const entries = await readdir(candidate, { withFileTypes: true });
    return entries.some(
      (entry) =>
        (entry.isDirectory() && /^\d+$/.test(entry.name)) ||
        (entry.isFile() && entry.name === "dir.yaml")
    );
  } catch {
    return false;
  }
}
