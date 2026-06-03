import { readFile } from "node:fs/promises";
import path from "node:path";
import { isObject, walkFiles } from "@origin-studio/core";
import YAML from "yaml";

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

export async function loadSchemaRegistry(rootDir: string): Promise<SchemaRegistry> {
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
