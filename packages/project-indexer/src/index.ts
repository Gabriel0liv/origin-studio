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
  ["tag", "tag"],
  ["resource", "resource"],
  ["item_modifier", "item_modifier"],
  ["modifier", "item_modifier"],
  ["function", "function"],
  ["damage_type", "damage_type"],
  ["origin", "origin"],
  ["layer", "origin_layer"]
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
      referencesTo[reference.id]?.push(reference);
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
    entry.references.filter((reference) =>
      reference.kind === "resource"
        ? !index.entries.some((candidate) => candidate.resourceDefinitions.includes(reference.id))
        : !index.byId[reference.id]
    )
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
      resourceDefinitions: [],
      resourceReferences: [],
      subpowerIds: []
    };
  }

  const document = await readJsonFile(filePath);
  const data = document.data;
  const namespacedId = kind === "tag" ? id : formatNamespacedId(id);

  return {
    id: namespacedId,
    kind,
    filePath,
    namespace,
    relativePath,
    data,
    references: extractReferences(filePath, data),
    resourceDefinitions: kind === "power" ? extractResourceDefinitions(namespacedId, data) : [],
    resourceReferences: extractResourceReferences(data),
    subpowerIds: kind === "power" ? extractSubpowerIds(namespacedId, data) : []
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
    } else if (key === "powers" && Array.isArray(child)) {
      for (const powerId of child) {
        if (typeof powerId === "string") {
          refs.push({
            kind: "power",
            id: formatNamespacedId(powerId),
            sourcePath,
            jsonPath: `${jsonPath}.${key}`
          });
        }
      }
    } else if (key === "origins" && Array.isArray(child)) {
      for (const originId of child) {
        if (typeof originId === "string") {
          refs.push({
            kind: "origin",
            id: formatNamespacedId(originId),
            sourcePath,
            jsonPath: `${jsonPath}.${key}`
          });
        }
      }
    } else if (key === "default_origin" && typeof child === "string") {
      refs.push({
        kind: "origin",
        id: formatNamespacedId(child),
        sourcePath,
        jsonPath: `${jsonPath}.${key}`
      });
    }

    refs.push(...extractReferences(sourcePath, child, `${jsonPath}.${key}`));
  }

  return refs;
}

function extractResourceDefinitions(baseId: string, value: unknown): string[] {
  const definitions = new Set<string>();

  const walk = (node: unknown, currentId?: string) => {
    if (!isObject(node)) return;

    if (node.type === "origins:resource" && currentId) {
      definitions.add(currentId);
    }

    if (node.type === "origins:multiple" && currentId) {
      const ignored = new Set(["type", "name", "description", "condition", "loading_priority", "hidden", "badges"]);
      for (const [key, child] of Object.entries(node)) {
        if (ignored.has(key)) continue;
        if (isObject(child)) {
          walk(child, `${currentId}_${key}`);
        }
      }
      return;
    }

    for (const child of Object.values(node)) {
      walk(child, currentId);
    }
  };

  walk(value, baseId);
  return [...definitions];
}

function extractResourceReferences(value: unknown): string[] {
  const references = new Set<string>();

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (!isObject(node)) return;

    const type = typeof node.type === "string" ? node.type : undefined;
    if (
      typeof node.resource === "string" &&
      (type === "origins:change_resource" ||
        type === "origins:modify_resource" ||
        type === "origins:set_resource" ||
        type === "origins:resource")
    ) {
      references.add(formatNamespacedId(node.resource));
    }

    for (const child of Object.values(node)) {
      walk(child);
    }
  };

  walk(value);
  return [...references];
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
