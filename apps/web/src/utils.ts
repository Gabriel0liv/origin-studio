import type {
  DefinitionItem,
  Diagnostic,
  FileReference,
  LookupEntry,
  NewFileDraft,
  NewFileKind,
  ReferenceItem,
  TreeNode
} from "./types";

export const recentProjectsKey = "origin-studio:recent-projects";

export const sectionOrder = [
  "origin",
  "origin_layer",
  "power",
  "item_modifier",
  "tag",
  "damage_type",
  "function",
  "unknown"
] as const;

export const explainMap: Record<string, string> = {
  "action-on-hit-invalid-chance":
    "Move chance into bientity_condition and use origins:chance in the appropriate context.",
  "action-on-hit-invalid-condition":
    "Top-level condition is not part of origins:action_on_hit. Use the contextual condition field instead.",
  "invalid-inverted-type":
    "origins:inverted is not a standalone type. Keep the original condition type and add inverted: true."
};

export async function fetchJson<T>(apiBase: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw) as { message?: string };
      message = parsed.message ?? raw;
    } catch {
      message = raw;
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => (node.type === "file" ? [node] : flattenFiles(node.children ?? [])));
}

export function groupNodes(nodes: TreeNode[], filter: string): Record<string, TreeNode[]> {
  const filtered = nodes.filter((node) => !filter || node.relativePath.toLowerCase().includes(filter.toLowerCase()));

  return filtered.reduce<Record<string, TreeNode[]>>((accumulator, node) => {
    const kind = node.kind ?? "unknown";
    accumulator[kind] ??= [];
    accumulator[kind].push(node);
    return accumulator;
  }, {});
}

export function labelForKind(kind?: string): string {
  switch (kind) {
    case "origin":
      return "Origins";
    case "origin_layer":
      return "Origin Layers";
    case "power":
      return "Powers";
    case "item_modifier":
      return "Item Modifiers";
    case "tag":
      return "Tags";
    case "damage_type":
      return "Damage Types";
    case "function":
      return "Functions";
    case "resource":
      return "Resources";
    default:
      return "Files";
  }
}

export function inferSchemaKindForFile(kind?: string): string | undefined {
  switch (kind) {
    case "power":
      return "power";
    case "origin":
      return "origin";
    case "origin_layer":
      return "origin_layer";
    case "item_modifier":
      return "item_modifier";
    case "tag":
      return "tag";
    case "damage_type":
      return "damage_type";
    default:
      return undefined;
  }
}

export function formatJsonDocument(content: string): string {
  try {
    return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
  } catch {
    return content;
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function basename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

export function dirnameLabel(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
}

export function toProjectRelative(projectRoot: string, filePath: string): string {
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.startsWith(normalizedRoot) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}

export function bySeverity(filter: "all" | "error" | "warning" | "info") {
  return (diagnostic: Diagnostic) => filter === "all" || diagnostic.severity === filter;
}

export function problemKey(problem: Diagnostic): string {
  return [problem.id, problem.filePath, problem.message, problem.range?.startLine, problem.range?.startColumn].join(":");
}

export function collapseDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...new Map(diagnostics.map((diagnostic) => [problemKey(diagnostic), diagnostic])).values()];
}

export function setValueAtPath(target: unknown, path: Array<string | number>, value: unknown): void {
  if (path.length === 0) return;

  let current = target as Record<string | number, unknown>;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]!;
    const next = current[segment];
    if (isObject(next) || Array.isArray(next)) {
      current = next as Record<string | number, unknown>;
      continue;
    }

    const nextSegment = path[index + 1]!;
    const replacement = (typeof nextSegment === "number" ? [] : {}) as unknown as Record<string | number, unknown>;
    current[segment] = replacement;
    current = replacement;
  }

  const lastSegment = path[path.length - 1]!;
  current[lastSegment] = value;
}

export function getValueAtPath(target: unknown, path: Array<string | number>): unknown {
  let current = target;

  for (const segment of path) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = current[segment as keyof typeof current];
  }

  return current;
}

export function inferFieldType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (isObject(value)) return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

export function buildLookup(files: TreeNode[]): Record<string, LookupEntry> {
  const lookup: Record<string, LookupEntry> = {};

  for (const file of files) {
    if (!file.kind || file.kind === "unknown") continue;
    const id = deriveIdFromRelativePath(file.relativePath, file.kind);
    if (!id) continue;
    lookup[id] = {
      id,
      kind: file.kind,
      path: file.path,
      relativePath: file.relativePath
    };
  }

  return lookup;
}

export function deriveIdFromRelativePath(relativePath: string, kind?: string): string | undefined {
  const normalized = relativePath.replace(/\\/g, "/");
  const jsonMatch = normalized.match(/^data\/([^/]+)\/([^/]+)\/(.+)\.json$/i);
  const functionMatch = normalized.match(/^data\/([^/]+)\/functions\/(.+)\.mcfunction$/i);

  if (kind === "function" && functionMatch) {
    return `${functionMatch[1]}:${functionMatch[2]}`;
  }

  if (!jsonMatch) return undefined;
  const [, namespace, folder, localPath] = jsonMatch;
  if (!namespace || !localPath) return undefined;

  switch (kind) {
    case "power":
    case "origin":
    case "item_modifier":
    case "damage_type":
      return `${namespace}:${localPath}`;
    case "origin_layer":
      return `${namespace}:${localPath}`;
    case "tag":
      return `#${namespace}:${localPath.replace(/^tags\//, "")}`;
    default:
      return undefined;
  }
}

export function collectReferenceGroups(json: unknown): Record<"power" | "tag" | "item_modifier" | "resource" | "function", string[]> {
  const groups: Record<"power" | "tag" | "item_modifier" | "resource" | "function", Set<string>> = {
    power: new Set<string>(),
    tag: new Set<string>(),
    item_modifier: new Set<string>(),
    resource: new Set<string>(),
    function: new Set<string>()
  };

  function walk(value: unknown, key?: string) {
    if (Array.isArray(value)) {
      if (key === "powers") {
        for (const item of value) {
          if (typeof item === "string") groups.power.add(item);
        }
      }

      value.forEach((item) => walk(item));
      return;
    }

    if (!isObject(value)) return;

    for (const [childKey, child] of Object.entries(value)) {
      if (typeof child === "string") {
        if (childKey === "power") groups.power.add(child);
        if (childKey === "tag") groups.tag.add(child);
        if (childKey === "item_modifier" || childKey === "modifier") groups.item_modifier.add(child);
        if (childKey === "resource") groups.resource.add(child);
        if (childKey === "function") groups.function.add(child);
      }

      walk(child, childKey);
    }
  }

  walk(json);
  return {
    power: [...groups.power],
    tag: [...groups.tag],
    item_modifier: [...groups.item_modifier],
    resource: [...groups.resource],
    function: [...groups.function]
  };
}

export function buildReferenceItem(
  kind: ReferenceItem["kind"],
  id: string,
  lookup: Record<string, LookupEntry>,
  diagnostics: Diagnostic[]
): ReferenceItem {
  const missing = diagnostics.some((diagnostic) => diagnostic.message.includes(`"${id}"`) && diagnostic.id.includes("missing"));
  const resolved = lookup[id];

  return {
    id,
    kind,
    status: missing ? "missing" : "found",
    ...(resolved?.path ? { path: resolved.path } : {})
  };
}

export function buildDefinitionsCreated(
  json: unknown,
  relativePath?: string,
  kind?: string,
  absolutePath?: string
): DefinitionItem[] {
  if (!relativePath || !kind) return [];

  const definitions: DefinitionItem[] = [];
  const ownId = deriveIdFromRelativePath(relativePath, kind);
  if (ownId) {
    definitions.push(makeDefinition(ownId, kind, absolutePath));
  }

  if (kind === "power" && isObject(json)) {
    if (json.type === "origins:multiple" && ownId) {
      for (const [key, child] of Object.entries(json)) {
        if (["type", "name", "description", "condition", "loading_priority", "hidden", "badges"].includes(key)) {
          continue;
        }

        if (!isObject(child)) continue;
        definitions.push(makeDefinition(`${ownId}_${key}`, "subpower", absolutePath));
        if (child.type === "origins:resource") {
          definitions.push(makeDefinition(`${ownId}_${key}`, "resource", absolutePath));
        }
      }
    }

    if (json.type === "origins:resource" && ownId) {
      definitions.push(makeDefinition(ownId, "resource", absolutePath));
    }
  }

  return collapseDefinitions(definitions);
}

export function collapseDefinitions(definitions: DefinitionItem[]): DefinitionItem[] {
  return [...new Map(definitions.map((definition) => [`${definition.kind}:${definition.id}`, definition])).values()];
}

export function makeDefinition(id: string, kind: string, path?: string): DefinitionItem {
  return {
    id,
    kind,
    ...(path ? { path } : {})
  };
}

export function startCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore clipboard failures in MVP
  }
}

export function loadRecentProjects(): string[] {
  try {
    const raw = window.localStorage.getItem(recentProjectsKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberProject(project: string, setRecentProjects: (items: string[]) => void) {
  const next = [project, ...loadRecentProjects().filter((item) => item !== project)].slice(0, 5);
  window.localStorage.setItem(recentProjectsKey, JSON.stringify(next));
  setRecentProjects(next);
}

export function buildDefaultDraft(kind: NewFileKind, namespaces: string[]): NewFileDraft {
  const namespace = namespaces[0] ?? "example";

  switch (kind) {
    case "power":
      return {
        kind,
        namespace,
        path: "new_power",
        type: "origins:simple",
        name: "New Power",
        description: "",
        hidden: false
      };
    case "origin":
      return {
        kind,
        namespace,
        path: "new_origin",
        name: "New Origin",
        description: "",
        hidden: false,
        icon: "minecraft:stone",
        impact: 1,
        order: 0
      };
    case "origin_layer":
      return {
        kind,
        namespace,
        path: "new_layer",
        name: "New Origin Layer",
        description: "",
        hidden: false,
        order: 0
      };
    case "item_modifier":
      return {
        kind,
        namespace,
        path: "new_item_modifier",
        type: "origins:add_power",
        name: "New Item Modifier",
        description: "",
        hidden: false
      };
    case "tag":
      return {
        kind,
        namespace,
        path: "new_tag",
        tagFolder: "items",
        name: "New Tag",
        description: "",
        hidden: false
      };
  }
}

export function buildNewFilePath(projectRoot: string, draft: NewFileDraft): string {
  const namespace = draft.namespace.trim();
  const localPath = draft.path.trim().replace(/^\/+|\/+$/g, "");

  switch (draft.kind) {
    case "power":
      return `${projectRoot}/data/${namespace}/powers/${localPath}.json`;
    case "origin":
      return `${projectRoot}/data/${namespace}/origins/${localPath}.json`;
    case "origin_layer":
      return `${projectRoot}/data/${namespace}/origin_layers/${localPath}.json`;
    case "item_modifier":
      return `${projectRoot}/data/${namespace}/item_modifiers/${localPath}.json`;
    case "tag":
      return `${projectRoot}/data/${namespace}/tags/${draft.tagFolder ?? "items"}/${localPath}.json`;
  }
}

export function buildNewFileContent(draft: NewFileDraft): unknown {
  switch (draft.kind) {
    case "power":
      return {
        type: draft.type ?? "origins:simple",
        name: draft.name,
        description: draft.description,
        hidden: draft.hidden
      };
    case "origin":
      return {
        name: draft.name,
        description: draft.description,
        icon: draft.icon ?? "minecraft:stone",
        impact: draft.impact ?? 1,
        order: draft.order ?? 0,
        powers: []
      };
    case "origin_layer":
      return {
        order: draft.order ?? 0,
        origins: []
      };
    case "item_modifier":
      return {
        type: draft.type ?? "origins:add_power"
      };
    case "tag":
      return {
        replace: false,
        values: []
      };
  }
}

export function inferNamespaces(projectRoot?: string, tree: TreeNode[] = []): string[] {
  const namespaces = new Set<string>();

  for (const file of flattenFiles(tree)) {
    const match = file.relativePath.match(/^data\/([^/]+)\//i);
    if (match?.[1]) namespaces.add(match[1]);
  }

  if (namespaces.size === 0 && projectRoot) {
    namespaces.add("example");
  }

  return [...namespaces].sort();
}

export function getInlineProblems(
  diagnostics: Diagnostic[],
  path: Array<string | number>,
  value?: unknown
): Diagnostic[] {
  const fieldName = String(path[path.length - 1] ?? "");
  const typedValue = isObject(value) && typeof value.type === "string" ? value.type : undefined;

  return diagnostics.filter((diagnostic) => {
    if (diagnostic.message.includes(`"${fieldName}"`)) return true;
    if (diagnostic.id === "invalid-inverted-type" && typedValue === "origins:inverted") return true;
    if (diagnostic.id === "action-on-hit-invalid-chance" && fieldName === "chance") return true;
    if (diagnostic.id === "action-on-hit-invalid-condition" && fieldName === "condition") return true;
    return false;
  });
}
