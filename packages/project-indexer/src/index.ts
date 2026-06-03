import path from "node:path";
import {
  type FileReference,
  type IndexedEntry,
  type ProjectIndex,
  datapackIdFromPath,
  detectFileKind,
  detectTagId,
  formatNamespacedId,
  isObject,
  readJsonFile,
  relativeUnixPath,
  walkFiles
} from "@origin-studio/core";
export type { ProjectIndex } from "@origin-studio/core";

const knownReferenceKeys = new Map<string, FileReference["kind"]>([
  ["power", "power"],
  ["powers", "power"],
  ["tag", "tag"],
  ["resource", "resource"],
  ["item_modifier", "item_modifier"],
  ["modifier", "item_modifier"],
  ["function", "function"],
  ["damage_type", "damage_type"]
]);

export async function indexProject(projectRoot: string): Promise<ProjectIndex> {
  const files = await walkFiles(projectRoot);
  const entries: IndexedEntry[] = [];

  for (const filePath of files) {
    const kind = detectFileKind(filePath);
    if (kind === "unknown") continue;
    const entry = await indexFile(projectRoot, filePath, kind);
    if (entry) entries.push(entry);
  }

  const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]));
  const byFile = Object.fromEntries(entries.map((entry) => [entry.filePath, entry]));
  const referencesTo: Record<string, FileReference[]> = {};

  for (const entry of entries) {
    for (const reference of entry.references) {
      referencesTo[reference.id] ??= [];
      const bucket = referencesTo[reference.id];
      if (bucket) {
        bucket.push(reference);
      }
    }
  }

  return {
    projectRoot,
    namespaces: [...new Set(entries.map((entry) => entry.namespace))].sort(),
    entries,
    byId,
    byFile,
    referencesTo
  };
}

export async function rebuildIndex(projectRoot: string): Promise<ProjectIndex> {
  return indexProject(projectRoot);
}

export function getPower(index: ProjectIndex, id: string): IndexedEntry | undefined {
  return getByKind(index, id, "power");
}

export function getOrigin(index: ProjectIndex, id: string): IndexedEntry | undefined {
  return getByKind(index, id, "origin");
}

export function getItemModifier(index: ProjectIndex, id: string): IndexedEntry | undefined {
  return getByKind(index, id, "item_modifier");
}

export function getTag(index: ProjectIndex, id: string): IndexedEntry | undefined {
  return getByKind(index, id, "tag");
}

export function getFunction(index: ProjectIndex, id: string): IndexedEntry | undefined {
  return getByKind(index, id, "function");
}

export function getReferencesTo(index: ProjectIndex, id: string): FileReference[] {
  return index.referencesTo[id] ?? [];
}

export function findBrokenReferences(index: ProjectIndex): FileReference[] {
  return index.entries.flatMap((entry) =>
    entry.references.filter((reference) => !index.byId[reference.id] && reference.kind !== "resource")
  );
}

function getByKind(index: ProjectIndex, id: string, kind: IndexedEntry["kind"]): IndexedEntry | undefined {
  const normalized = id.startsWith("#") ? id : formatNamespacedId(id);
  const entry = index.byId[normalized];
  return entry?.kind === kind ? entry : undefined;
}

async function indexFile(
  projectRoot: string,
  filePath: string,
  kind: IndexedEntry["kind"]
): Promise<IndexedEntry | undefined> {
  const relativePath = relativeUnixPath(projectRoot, filePath);
  const namespace = relativePath.split("/")[1];
  const id =
    kind === "tag" ? detectTagId(projectRoot, filePath) : datapackIdFromPath(projectRoot, filePath);
  if (!namespace || !id) return undefined;

  if (kind === "function") {
    return {
      id: formatNamespacedId(id),
      kind,
      filePath,
      namespace,
      relativePath,
      references: [],
      resources: [],
      subpowerIds: []
    };
  }

  const document = await readJsonFile(filePath);
  const data = document.data;
  const references = extractReferences(filePath, data);
  const resources = extractResourceIds(data);
  const subpowerIds =
    kind === "power" ? extractSubpowerIds(formatNamespacedId(id), data) : [];

  return {
    id: kind === "tag" ? id : formatNamespacedId(id),
    kind,
    filePath,
    namespace,
    relativePath,
    data,
    references,
    resources,
    subpowerIds
  };
}

function extractReferences(sourcePath: string, value: unknown, jsonPath = "$"): FileReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => extractReferences(sourcePath, item, `${jsonPath}[${index}]`));
  }

  if (!isObject(value)) {
    return [];
  }

  const refs: FileReference[] = [];

  for (const [key, child] of Object.entries(value)) {
    const kind = knownReferenceKeys.get(key);
    if (kind && typeof child === "string") {
      refs.push({
        kind,
        id: kind === "tag" ? ensureTagId(child) : formatNamespacedId(child),
        sourcePath,
        jsonPath: `${jsonPath}.${key}`
      });
    } else if (key === "origins" && Array.isArray(child)) {
      for (const originId of child) {
        if (typeof originId === "string") {
          refs.push({
            kind: "power",
            id: formatNamespacedId(originId),
            sourcePath,
            jsonPath: `${jsonPath}.${key}`
          });
        }
      }
    }

    refs.push(...extractReferences(sourcePath, child, `${jsonPath}.${key}`));
  }

  return refs;
}

function extractResourceIds(value: unknown): string[] {
  if (!isObject(value)) return [];
  const resources = new Set<string>();

  if (typeof value.resource === "string") {
    resources.add(formatNamespacedId(value.resource));
  }

  if (Array.isArray(value.powers)) {
    for (const power of value.powers) {
      if (typeof power === "string") resources.add(formatNamespacedId(power));
    }
  }

  for (const child of Object.values(value)) {
    for (const resource of extractResourceIds(child)) {
      resources.add(resource);
    }
  }

  return [...resources];
}

function extractSubpowerIds(baseId: string, value: unknown): string[] {
  if (!isObject(value) || value.type !== "origins:multiple") return [];

  const ignored = new Set([
    "type",
    "name",
    "description",
    "condition",
    "loading_priority",
    "hidden",
    "badges"
  ]);

  return Object.entries(value)
    .filter(([key, child]) => !ignored.has(key) && isObject(child))
    .map(([key]) => `${baseId}_${key}`);
}

function ensureTagId(id: string): string {
  const formatted = formatNamespacedId(id.startsWith("#") ? id.slice(1) : id);
  return `#${formatted}`;
}
