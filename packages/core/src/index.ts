import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyEdits,
  format,
  modify,
  parse,
  printParseErrorCode,
  type ParseError
} from "jsonc-parser";

export type FileKind =
  | "power"
  | "origin"
  | "origin_layer"
  | "item_modifier"
  | "tag"
  | "damage_type"
  | "function"
  | "unknown";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface QuickFix {
  label: string;
  replacement?: string;
  removePath?: string;
  addPath?: string;
  addValue?: unknown;
}

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  filePath: string;
  range?: DiagnosticRange | undefined;
  message: string;
  suggestion?: string | undefined;
  docsUrl?: string | undefined;
  quickFix?: QuickFix | undefined;
}

export interface ParseJsonLikeResult<T = unknown> {
  data: T | undefined;
  errors: string[];
}

export interface JsonDocument<T = unknown> {
  path: string;
  raw: string;
  data: T | undefined;
  errors: string[];
}

export interface FileReference {
  kind: "power" | "item_modifier" | "tag" | "resource" | "function" | "damage_type";
  id: string;
  sourcePath: string;
  jsonPath?: string;
}

export interface IndexedEntry {
  id: string;
  kind: FileKind;
  filePath: string;
  namespace: string;
  relativePath: string;
  data?: unknown;
  references: FileReference[];
  resources: string[];
  subpowerIds: string[];
}

export interface ProjectIndex {
  projectRoot: string;
  namespaces: string[];
  entries: IndexedEntry[];
  byId: Record<string, IndexedEntry>;
  byFile: Record<string, IndexedEntry>;
  referencesTo: Record<string, FileReference[]>;
}

const JSON_INDENT = 2;

export function parseJsonLike<T = unknown>(content: string): ParseJsonLikeResult<T> {
  const errors: ParseError[] = [];
  const data = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false
  }) as T;

  return {
    data,
    errors: errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
  };
}

export function formatNamespacedId(id: string, defaultNamespace = "minecraft"): string {
  if (id.startsWith("#")) {
    return `#${formatNamespacedId(id.slice(1), defaultNamespace)}`;
  }

  return id.includes(":") ? id : `${defaultNamespace}:${id}`;
}

export function getKindFolder(kind: FileKind): string | undefined {
  switch (kind) {
    case "power":
      return "powers";
    case "origin":
      return "origins";
    case "origin_layer":
      return "origin_layers";
    case "item_modifier":
      return "item_modifiers";
    case "damage_type":
      return "damage_type";
    case "function":
      return "functions";
    default:
      return undefined;
  }
}

export function resolveDatapackPath(projectRoot: string, id: string, kind: FileKind): string {
  const normalizedId = formatNamespacedId(id);
  const [namespace, localPath] = normalizedId.replace(/^#/, "").split(":");
  const folder = getKindFolder(kind);

  if (!folder || !namespace || !localPath) {
    throw new Error(`Cannot resolve path for kind "${kind}"`);
  }

  const extension = kind === "function" ? ".mcfunction" : ".json";
  return path.join(projectRoot, "data", namespace, folder, `${localPath}${extension}`);
}

export async function getDatapackNamespaces(projectRoot: string): Promise<string[]> {
  const dataRoot = path.join(projectRoot, "data");
  try {
    const entries = await readdir(dataRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function relativeUnixPath(root: string, filePath: string): string {
  return normalizeSlashes(path.relative(root, filePath));
}

export function detectFileKind(filePath: string): FileKind {
  const normalized = normalizeSlashes(filePath);
  if (/\/data\/[^/]+\/powers\/.+\.json$/i.test(normalized)) return "power";
  if (/\/data\/[^/]+\/origins\/.+\.json$/i.test(normalized)) return "origin";
  if (/\/data\/[^/]+\/origins?_layers\/.+\.json$/i.test(normalized)) return "origin_layer";
  if (/\/data\/[^/]+\/item_modifiers\/.+\.json$/i.test(normalized)) return "item_modifier";
  if (/\/data\/[^/]+\/damage_type\/.+\.json$/i.test(normalized)) return "damage_type";
  if (/\/data\/[^/]+\/functions\/.+\.mcfunction$/i.test(normalized)) return "function";
  if (/\/data\/[^/]+\/tags\/.+\.json$/i.test(normalized)) return "tag";
  return "unknown";
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<JsonDocument<T>> {
  const raw = await readFile(filePath, "utf8");
  const parsed = parseJsonLike<T>(raw);
  return {
    path: filePath,
    raw,
    data: parsed.data,
    errors: parsed.errors
  };
}

export async function writeJsonFile(filePath: string, content: string | unknown): Promise<void> {
  const raw = typeof content === "string" ? content : JSON.stringify(content, null, JSON_INDENT);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, raw.endsWith("\n") ? raw : `${raw}\n`, "utf8");
}

export async function applyJsonPatch(
  filePath: string,
  patch: { jsonPath: (string | number)[]; value: unknown }
): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const edits = modify(raw, patch.jsonPath, patch.value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: JSON_INDENT
    }
  });
  const updated = applyEdits(raw, edits);
  await writeFile(filePath, updated, "utf8");
}

export function formatJsonDocument(content: string): string {
  return applyEdits(
    content,
    format(content, undefined, {
      insertSpaces: true,
      tabSize: JSON_INDENT
    })
  );
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getLineRange(source: string, match: string): DiagnosticRange | undefined {
  const index = source.indexOf(match);
  if (index < 0) return undefined;
  const before = source.slice(0, index);
  const startLine = before.split("\n").length;
  const lastLineStart = before.lastIndexOf("\n");
  const startColumn = index - lastLineStart;
  return {
    startLine,
    startColumn,
    endLine: startLine,
    endColumn: startColumn + match.length
  };
}

export async function walkFiles(root: string): Promise<string[]> {
  const items: string[] = [];

  async function visit(current: string): Promise<void> {
    const currentStat = await stat(current);
    if (currentStat.isFile()) {
      items.push(current);
      return;
    }

    const children = await readdir(current, { withFileTypes: true });
    await Promise.all(
      children.map(async (child) => {
        if (child.name === "node_modules" || child.name === ".git" || child.name === "dist") {
          return;
        }
        await visit(path.join(current, child.name));
      })
    );
  }

  try {
    await visit(root);
  } catch {
    return [];
  }

  return items;
}

export function ensureWithinRoot(root: string, candidatePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidatePath);

  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Path escapes project root: ${candidatePath}`);
  }

  return resolvedCandidate;
}

export function datapackIdFromPath(projectRoot: string, filePath: string): string | undefined {
  const normalized = relativeUnixPath(projectRoot, filePath);
  const match = normalized.match(/^data\/([^/]+)\/([^/]+)\/(.+?)(\.(json|mcfunction))$/);
  if (!match) return undefined;

  const [, namespace, folder, localPath] = match;
  if (!namespace || !folder || !localPath) return undefined;
  const baseFolder = folder === "origins_layers" ? "origin_layers" : folder;
  if (
    ![
      "powers",
      "origins",
      "origin_layers",
      "origins_layers",
      "item_modifiers",
      "damage_type",
      "functions"
    ].includes(folder)
  ) {
    return undefined;
  }

  return `${namespace}:${localPath}`;
}

export function detectTagId(projectRoot: string, filePath: string): string | undefined {
  const normalized = relativeUnixPath(projectRoot, filePath);
  const match = normalized.match(/^data\/([^/]+)\/tags\/(.+?)\.json$/);
  if (!match) return undefined;
  const [, namespace, localPath] = match;
  return `#${namespace}:${localPath}`;
}
