import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isObject, walkFiles } from "@origin-studio/core";
import YAML from "yaml";

export { findWorkspaceRoot, resolveSchemaDir } from "./schemaPaths.js";

export interface NormalizedField {
  name: string;
  type: string;
  required: boolean;
  description?: string | undefined;
  defaultValue?: unknown;
  allowedValues?: string[] | undefined;
  nestedKind?: string | undefined;
  arrayItemType?: string | undefined;
  warnings?: string[] | undefined;
}

export interface NormalizedTypeDefinition {
  id: string;
  kind: string;
  description?: string | undefined;
  fields: NormalizedField[];
  examples?: unknown[] | undefined;
  aliases?: string[] | undefined;
  deprecated?: boolean;
  source: string;
}

export interface SchemaRegistry {
  version: string;
  loadedFrom: string;
  typesByKind: Record<string, Record<string, NormalizedTypeDefinition>>;
}

const builtinRegistry: SchemaRegistry = {
  version: "builtin-mvp",
  loadedFrom: "builtin",
  typesByKind: {
    power: buildDefinitions("power", [
      ["origins:simple", []],
      ["origins:multiple", [{ name: "type", type: "string", required: true }]],
      [
        "origins:active_self",
        [
          { name: "type", type: "string", required: true },
          { name: "entity_action", type: "entity_action", required: true },
          { name: "cooldown", type: "number", required: false },
          { name: "hud_render", type: "object", required: false },
          { name: "key", type: "object", required: false }
        ]
      ],
      [
        "origins:action_on_hit",
        [
          { name: "type", type: "string", required: true },
          { name: "bientity_action", type: "bientity_action", required: false },
          { name: "damage_condition", type: "damage_condition", required: false },
          { name: "bientity_condition", type: "bientity_condition", required: false }
        ]
      ],
      ["origins:action_when_hit", [{ name: "type", type: "string", required: true }]],
      ["origins:action_over_time", [{ name: "type", type: "string", required: true }]],
      ["origins:attribute", [{ name: "type", type: "string", required: true }]],
      ["origins:conditioned_attribute", [{ name: "type", type: "string", required: true }]],
      ["origins:modify_damage_dealt", [{ name: "type", type: "string", required: true }]],
      ["origins:modify_damage_taken", [{ name: "type", type: "string", required: true }]],
      ["origins:resource", [{ name: "type", type: "string", required: true }]],
      ["origins:cooldown", [{ name: "type", type: "string", required: true }]]
    ]),
    origin: {
      __root__: {
        id: "__root__",
        kind: "origin",
        source: "builtin",
        fields: [
          { name: "name", type: "string", required: true },
          { name: "description", type: "string", required: true },
          { name: "powers", type: "array", required: true }
        ]
      }
    },
    origin_layer: {
      __root__: {
        id: "__root__",
        kind: "origin_layer",
        source: "builtin",
        fields: [
          { name: "origins", type: "array", required: true },
          { name: "replace", type: "boolean", required: false }
        ]
      }
    },
    item_modifier: {
      __root__: {
        id: "__root__",
        kind: "item_modifier",
        source: "builtin",
        fields: []
      }
    },
    tag: {
      __root__: {
        id: "__root__",
        kind: "tag",
        source: "builtin",
        fields: [
          { name: "replace", type: "boolean", required: false },
          { name: "values", type: "array", required: true }
        ]
      }
    },
    damage_type: {
      __root__: {
        id: "__root__",
        kind: "damage_type",
        source: "builtin",
        fields: []
      }
    },
    entity_action: buildDefinitions("entity_action", [
      ["origins:and", [{ name: "actions", type: "array", required: true }]],
      ["origins:if_else", [{ name: "type", type: "string", required: true }]],
      ["origins:if_else_list", [{ name: "actions", type: "array", required: true }]],
      ["origins:grant_power", [{ name: "power", type: "power_reference", required: true }]],
      ["origins:remove_power", [{ name: "power", type: "power_reference", required: true }]],
      ["origins:change_resource", [{ name: "resource", type: "resource_reference", required: true }]],
      ["origins:trigger_cooldown", [{ name: "power", type: "power_reference", required: true }]],
      ["origins:apply_effect", [{ name: "effect", type: "string", required: true }]],
      ["origins:execute_command", [{ name: "command", type: "string", required: true }]],
      ["origins:play_sound", [{ name: "sound", type: "string", required: true }]],
      ["origins:spawn_particles", [{ name: "particle", type: "string", required: true }]],
      ["origins:area_of_effect", [{ name: "radius", type: "number", required: true }]]
    ]),
    bientity_action: buildDefinitions("bientity_action", [
      ["origins:and", [{ name: "actions", type: "array", required: true }]],
      ["origins:target_action", [{ name: "action", type: "entity_action", required: true }]],
      ["origins:actor_action", [{ name: "action", type: "entity_action", required: true }]],
      ["origins:add_velocity", [{ name: "x", type: "number", required: false }]],
      ["origins:damage", [{ name: "amount", type: "number", required: true }]],
      ["origins:grant_power", [{ name: "power", type: "power_reference", required: true }]]
    ]),
    bientity_condition: buildDefinitions("bientity_condition", [
      ["origins:and", [{ name: "conditions", type: "array", required: true }]],
      ["origins:or", [{ name: "conditions", type: "array", required: true }]],
      ["origins:actor_condition", [{ name: "condition", type: "condition", required: true }]],
      ["origins:target_condition", [{ name: "condition", type: "condition", required: true }]],
      ["origins:distance", [{ name: "comparison", type: "string", required: true }]]
    ]),
    condition: buildDefinitions("condition", [
      ["origins:and", [{ name: "conditions", type: "array", required: true }]],
      ["origins:or", [{ name: "conditions", type: "array", required: true }]],
      ["origins:chance", [{ name: "chance", type: "number", required: true }]],
      ["origins:resource", [{ name: "resource", type: "resource_reference", required: true }]],
      ["origins:power", [{ name: "power", type: "power_reference", required: true }]],
      ["origins:equipped_item", [{ name: "equipment_slot", type: "string", required: false }]],
      ["origins:status_effect", [{ name: "effect", type: "string", required: true }]],
      ["origins:sneaking", []],
      ["origins:in_tag", [{ name: "tag", type: "tag_reference", required: true }]],
      ["origins:entity_type", [{ name: "entity_type", type: "string", required: true }]],
      ["origins:distance", [{ name: "comparison", type: "string", required: true }]]
    ]),
    item_condition: buildDefinitions("item_condition", [
      ["origins:ingredient", [{ name: "ingredient", type: "object", required: true }]],
      ["origins:nbt", [{ name: "nbt", type: "string", required: true }]],
      ["origins:enchantment", [{ name: "enchantment", type: "string", required: true }]],
      ["origins:armor_value", [{ name: "comparison", type: "string", required: true }]],
      ["origins:empty", []]
    ]),
    damage_condition: buildDefinitions("damage_condition", [
      ["origins:in_tag", [{ name: "tag", type: "tag_reference", required: true }]],
      ["origins:name", [{ name: "name", type: "string", required: true }]],
      ["origins:amount", [{ name: "comparison", type: "string", required: true }]],
      ["origins:attacker", [{ name: "condition", type: "condition", required: true }]]
    ])
  }
};

function buildDefinitions(
  kind: string,
  items: Array<[string, Array<Pick<NormalizedField, "name" | "type" | "required">>]>
): Record<string, NormalizedTypeDefinition> {
  return Object.fromEntries(
    items.map(([id, fields]) => [
      id,
      {
        id,
        kind,
        fields,
        source: "builtin"
      }
    ])
  );
}

export async function loadSchemaRegistry(rootDir?: string): Promise<SchemaRegistry> {
  if (!rootDir) {
    return builtinRegistry;
  }

  const latestVersionDir = await getLatestVersionDir(rootDir);
  if (latestVersionDir) {
    return loadOriginCreatorRegistry(rootDir, latestVersionDir);
  }

  const entries = await walkFiles(rootDir);
  const yamlFiles = entries.filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"));
  if (yamlFiles.length === 0) {
    return builtinRegistry;
  }

  const typesByKind: SchemaRegistry["typesByKind"] = structuredClone(builtinRegistry.typesByKind);

  for (const filePath of yamlFiles) {
    const raw = await readFile(filePath, "utf8");
    const parsed = YAML.parse(raw);
    if (!isObject(parsed)) continue;
    const kind = typeof parsed.kind === "string" ? parsed.kind : inferKindFromPath(rootDir, filePath);
    const id = typeof parsed.id === "string" ? parsed.id : typeof parsed.type === "string" ? parsed.type : undefined;
    if (!kind || !id) continue;

    const fieldsValue = Array.isArray(parsed.fields) ? parsed.fields : [];
    const fields: NormalizedField[] = fieldsValue
      .filter(isObject)
      .map((field) => ({
        name: String(field.name ?? field.key ?? "unknown"),
        type: String(field.type ?? "unknown"),
        required: Boolean(field.required),
        description: typeof field.description === "string" ? field.description : undefined,
        defaultValue: field.default,
        allowedValues: Array.isArray(field.allowedValues)
          ? field.allowedValues.map(String)
          : Array.isArray(field.values)
            ? field.values.map(String)
            : undefined,
        nestedKind: typeof field.nestedKind === "string" ? field.nestedKind : undefined,
        arrayItemType: typeof field.arrayItemType === "string" ? field.arrayItemType : undefined,
        warnings: Array.isArray(field.warnings) ? field.warnings.map(String) : undefined
      }));

    typesByKind[kind] ??= {};
    typesByKind[kind][id] = {
      id,
      kind,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      fields,
      examples: Array.isArray(parsed.examples) ? parsed.examples : undefined,
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases.map(String) : undefined,
      deprecated: Boolean(parsed.deprecated),
      source: path.relative(rootDir, filePath)
    };
  }

  return {
    version: new Date().toISOString(),
    loadedFrom: rootDir,
    typesByKind
  };
}

async function getLatestVersionDir(rootDir: string): Promise<string | undefined> {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const numericDirs = entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => Number(right) - Number(left));

    for (const candidate of numericDirs) {
      const candidateFiles = await readdir(path.join(rootDir, candidate));
      if (candidateFiles.includes("powers.yaml")) {
        return candidate;
      }
    }

    return numericDirs[0];
  } catch {
    return undefined;
  }
}

async function loadOriginCreatorRegistry(rootDir: string, versionDir: string): Promise<SchemaRegistry> {
  const typesByKind: SchemaRegistry["typesByKind"] = structuredClone(builtinRegistry.typesByKind);
  const baseDir = path.join(rootDir, versionDir);

  await loadRootSchema(path.join(baseDir, "origins.yaml"), "origin", typesByKind);
  await loadRootSchema(path.join(baseDir, "origin_layers.yaml"), "origin_layer", typesByKind);
  await loadRootSchema(path.join(baseDir, "item_modifiers.yaml"), "item_modifier", typesByKind);
  await loadRootSchema(path.join(baseDir, "damage_type.yaml"), "damage_type", typesByKind);
  await loadRootSchema(path.join(baseDir, "tags.yaml"), "tag", typesByKind);
  await loadPowerSchema(path.join(baseDir, "powers.yaml"), typesByKind);

  return {
    version: versionDir,
    loadedFrom: rootDir,
    typesByKind
  };
}

async function loadRootSchema(
  filePath: string,
  kind: string,
  typesByKind: SchemaRegistry["typesByKind"]
): Promise<void> {
  try {
    const parsed = YAML.parse(await readFile(filePath, "utf8"));
    if (!isObject(parsed)) return;
    const definition = objectSchemaToDefinition("__root__", kind, parsed, filePath);
    if (!definition) return;
    typesByKind[kind] ??= {};
    typesByKind[kind][definition.id] = definition;
  } catch {
    // optional schema file missing
  }
}

async function loadPowerSchema(
  filePath: string,
  typesByKind: SchemaRegistry["typesByKind"]
): Promise<void> {
  const parsed = YAML.parse(await readFile(filePath, "utf8"));
  if (!isObject(parsed)) return;

  const links = isObject(parsed.links) ? parsed.links : undefined;
  if (!links) return;

  const powerBase = isObject(links.power_base) ? links.power_base : undefined;
  const powerProps = powerBase && isObject(powerBase.props) ? powerBase.props : undefined;
  const typeNode = powerProps && isObject(powerProps.type) ? powerProps.type : undefined;
  const more = typeNode && isObject(typeNode.more) ? typeNode.more : undefined;

  if (more) {
    const extractedPowerDefinitions: Record<string, NormalizedTypeDefinition> = {};

    for (const [variantKey, variantValue] of Object.entries(more)) {
      if (!variantKey.startsWith("string-") || !isObject(variantValue)) continue;
      const typeId = variantKey.slice("string-".length);
      const definition = objectSchemaToDefinition(typeId, "power", {
        type: "object",
        props: variantValue
      }, filePath);
      if (definition) {
        extractedPowerDefinitions[typeId] = withTypeField(definition);
      }
    }

    typesByKind.power = {
      ...(typesByKind.power ?? {}),
      ...extractedPowerDefinitions
    };
  }

  const linkKinds: Record<string, string> = {
    entity_action: "entity_action",
    bi_entity_action: "bientity_action",
    entity_cond: "condition",
    bi_entity_cond: "bientity_condition",
    item_cond: "item_condition",
    damage_cond: "damage_condition"
  };

  for (const [linkKey, kind] of Object.entries(linkKinds)) {
    const linkNode = links[linkKey];
    if (!isObject(linkNode)) continue;
    for (const definition of extractDefinitionsFromLink(linkNode, kind, filePath)) {
      typesByKind[kind] ??= {};
      typesByKind[kind][definition.id] = definition;
    }
  }
}

function extractDefinitionsFromLink(
  linkNode: Record<string, unknown>,
  kind: string,
  filePath: string
): NormalizedTypeDefinition[] {
  const variants = Array.isArray(linkNode.or) ? linkNode.or : [];
  const definitions: NormalizedTypeDefinition[] = [];

  for (const variant of variants) {
    if (!isObject(variant)) continue;
    const props = isObject(variant.props) ? variant.props : undefined;
    const typeNode = props && isObject(props.type) ? props.type : undefined;
    const more = typeNode && isObject(typeNode.more) ? typeNode.more : undefined;
    if (!more) continue;

    for (const [variantKey, variantValue] of Object.entries(more)) {
      if (!variantKey.startsWith("string-") || !isObject(variantValue)) continue;
      const typeId = variantKey.slice("string-".length);
      const definition = objectSchemaToDefinition(typeId, kind, {
        type: "object",
        props: variantValue
      }, filePath);
      if (definition) {
        definitions.push(definition);
      }
    }
  }

  return definitions;
}

function objectSchemaToDefinition(
  id: string,
  kind: string,
  node: Record<string, unknown>,
  filePath: string
): NormalizedTypeDefinition | undefined {
  return {
    id,
    kind,
    description: typeof node.desc === "string" ? node.desc : undefined,
    fields: collectFields(node),
    source: filePath
  };
}

function withTypeField(definition: NormalizedTypeDefinition): NormalizedTypeDefinition {
  const typeField: NormalizedField = {
    name: "type",
    type: "string",
    required: true
  };

  return {
    ...definition,
    fields: dedupeFields([typeField, ...definition.fields])
  };
}

function collectFields(node: Record<string, unknown>): NormalizedField[] {
  const props: Record<string, unknown> = isObject(node.props) ? node.props : {};
  return dedupeFields(
    Object.entries(props)
      .filter(([, value]) => isObject(value))
      .map(([name, value]) => schemaPropToField(name, value as Record<string, unknown>))
  );
}

function schemaPropToField(name: string, node: Record<string, unknown>): NormalizedField {
  const nestedKind = inferNestedKind(node);
  const type = nestedKind ?? normalizeFieldType(node);
  const allowedValues = extractAllowedValues(node);
  const arrayItemType = extractArrayItemType(node);

  return {
    name,
    type,
    required: !Boolean(node.unspec),
    description: typeof node.desc === "string" ? node.desc : undefined,
    defaultValue: node.default,
    allowedValues,
    nestedKind,
    arrayItemType,
    warnings: Array.isArray(node.hooks) ? node.hooks.map(String) : undefined
  };
}

function extractAllowedValues(node: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(node.enum)) {
    return node.enum.filter((value) => typeof value === "string").map(String);
  }

  if (Array.isArray(node.or)) {
    const nestedEnums = node.or
      .filter(isObject)
      .flatMap((item) => (Array.isArray(item.enum) ? item.enum : []))
      .filter((value): value is string => typeof value === "string");
    return nestedEnums.length > 0 ? nestedEnums : undefined;
  }

  return undefined;
}

function inferNestedKind(node: Record<string, unknown>): string | undefined {
  const link = typeof node.link === "string" ? node.link : undefined;
  if (!link) return undefined;

  const mapping: Record<string, string> = {
    entity_action: "entity_action",
    bi_entity_action: "bientity_action",
    entity_cond: "condition",
    bi_entity_cond: "bientity_condition",
    item_cond: "item_condition",
    damage_cond: "damage_condition",
    power_base: "power",
    power: "power",
    origin: "origin"
  };

  return mapping[link];
}

function normalizeFieldType(node: Record<string, unknown>): string {
  if (typeof node.type === "string") return node.type;
  if (Array.isArray(node.or)) return "union";
  if (isObject(node.props)) return "object";
  return "unknown";
}

function extractArrayItemType(node: Record<string, unknown>): string | undefined {
  const vals = isObject(node.vals) ? node.vals : undefined;
  if (!vals) return undefined;
  return inferNestedKind(vals) ?? (typeof vals.type === "string" ? vals.type : undefined);
}

function dedupeFields(fields: NormalizedField[]): NormalizedField[] {
  return [...new Map(fields.map((field) => [field.name, field])).values()];
}

function inferKindFromPath(rootDir: string, filePath: string): string | undefined {
  const relative = path.relative(rootDir, filePath).replace(/\\/g, "/");
  if (relative.includes("power")) return "power";
  if (relative.includes("bientity")) return "bientity_action";
  if (relative.includes("entity_action")) return "entity_action";
  if (relative.includes("damage_condition")) return "damage_condition";
  if (relative.includes("item_condition")) return "item_condition";
  if (relative.includes("condition")) return "condition";
  return undefined;
}

export function getTypesForKind(registry: SchemaRegistry, kind: string): NormalizedTypeDefinition[] {
  return Object.values(registry.typesByKind[kind] ?? {}).sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

export function getTypeDefinition(
  registry: SchemaRegistry,
  kind: string,
  type: string
): NormalizedTypeDefinition | undefined {
  return registry.typesByKind[kind]?.[type];
}

export function getSchemaKinds(registry: SchemaRegistry): string[] {
  return Object.keys(registry.typesByKind).sort();
}
