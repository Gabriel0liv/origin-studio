import {
  type Diagnostic,
  type IndexedEntry,
  getLineRange,
  isObject,
  readJsonFile
} from "@origin-studio/core";
import {
  type NormalizedTypeDefinition,
  type SchemaRegistry,
  getTypeDefinition
} from "@origin-studio/origin-creator-adapter";
import { type ProjectIndex, getTag } from "@origin-studio/project-indexer";

export interface ValidationContext {
  index: ProjectIndex;
  registry: SchemaRegistry;
}

interface ValidateNodeArgs {
  value: Record<string, unknown>;
  schemaKind: string;
  filePath: string;
  raw: string;
  jsonPath: string;
  context: ValidationContext;
}

export async function validateProject(context: ValidationContext): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const entry of context.index.entries) {
    diagnostics.push(...(await validateEntry(entry, context)));
  }

  return diagnostics;
}

export async function validateFile(
  filePath: string,
  context: ValidationContext
): Promise<Diagnostic[]> {
  const entry = context.index.byFile[filePath];
  if (!entry) return [];
  return validateEntry(entry, context);
}

async function validateEntry(entry: IndexedEntry, context: ValidationContext): Promise<Diagnostic[]> {
  if (entry.kind === "function") return [];

  const document = await readJsonFile(entry.filePath);
  const diagnostics: Diagnostic[] = [];

  for (const error of document.errors) {
    diagnostics.push({
      id: "invalid-json",
      severity: "error",
      filePath: entry.filePath,
      message: `Invalid JSON/JSONC: ${error}`
    });
  }

  if (!isObject(document.data)) {
    return diagnostics;
  }

  const schemaKind = inferSchemaKind(entry);
  const rootDefinition = getTypeDefinition(context.registry, schemaKind, "__root__");
  if (rootDefinition) {
    diagnostics.push(
      ...validateDefinitionFields(entry.filePath, document.raw, document.data, rootDefinition)
    );
  }

  diagnostics.push(
    ...validateNode({
      value: document.data,
      schemaKind,
      filePath: entry.filePath,
      raw: document.raw,
      jsonPath: "$",
      context
    })
  );
  diagnostics.push(...validateReferences(entry, context));
  return diagnostics;
}

function validateNode(args: ValidateNodeArgs): Diagnostic[] {
  const { value, schemaKind, filePath, raw, jsonPath, context } = args;
  const diagnostics: Diagnostic[] = [];
  const type = typeof value.type === "string" ? value.type : undefined;
  const definition = type ? getTypeDefinition(context.registry, schemaKind, type) : undefined;

  if (type && hasSchemaKind(context.registry, schemaKind) && !definition) {
    diagnostics.push({
      id: "unknown-type",
      severity: "error",
      filePath,
      range: getLineRange(raw, `"${type}"`),
      message: `Unknown ${schemaKind} type "${type}".`
    });
  }

  if (definition) {
    diagnostics.push(...validateDefinitionFields(filePath, raw, value, definition));
  }

  diagnostics.push(...validateCommonRules(filePath, raw, value));

  for (const [key, child] of Object.entries(value)) {
    const childKind = inferNestedSchemaKind(schemaKind, key, child);
    if (!childKind) continue;

    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        if (isObject(item)) {
          diagnostics.push(
            ...validateNode({
              value: item,
              schemaKind: childKind,
              filePath,
              raw,
              jsonPath: `${jsonPath}.${key}[${index}]`,
              context
            })
          );
        }
      });
    } else if (isObject(child)) {
      diagnostics.push(
        ...validateNode({
          value: child,
          schemaKind: childKind,
          filePath,
          raw,
          jsonPath: `${jsonPath}.${key}`,
          context
        })
      );
    }
  }

  if (value.type === "origins:multiple") {
    const ignored = new Set(["type", "name", "description", "condition", "loading_priority", "hidden", "badges"]);
    for (const [key, child] of Object.entries(value)) {
      if (ignored.has(key) || !isObject(child)) continue;
      diagnostics.push(
        ...validateNode({
          value: child,
          schemaKind: "power",
          filePath,
          raw,
          jsonPath: `${jsonPath}.${key}`,
          context
        })
      );
    }
  }

  return diagnostics;
}

function validateDefinitionFields(
  filePath: string,
  raw: string,
  data: Record<string, unknown>,
  definition: NormalizedTypeDefinition
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const allowed = new Set(definition.fields.map((field) => field.name));
  allowed.add("type");
  allowed.add("name");
  allowed.add("description");
  allowed.add("hidden");
  allowed.add("loading_priority");
  allowed.add("condition");
  allowed.add("badges");

  for (const field of definition.fields) {
    if (field.required && !(field.name in data)) {
      diagnostics.push({
        id: "missing-required-field",
        severity: "error",
        filePath,
        message: `Missing required field "${field.name}" for type "${definition.id}".`,
        suggestion: field.description
      });
    }
  }

  for (const key of Object.keys(data)) {
    if (!allowed.has(key) && !isLikelySubpower(definition.id, key, data[key])) {
      diagnostics.push({
        id: "unsupported-field",
        severity: "warning",
        filePath,
        range: getLineRange(raw, `"${key}"`),
        message: `Field "${key}" is not documented for type "${definition.id}".`,
        suggestion: "Unknown fields are preserved, but review whether this field belongs here."
      });
    }
  }

  return diagnostics;
}

function validateReferences(entry: IndexedEntry, context: ValidationContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const reference of entry.references) {
    switch (reference.kind) {
      case "power":
        if (!context.index.byId[reference.id] && !entry.subpowerIds.includes(reference.id)) {
          diagnostics.push(
            makeMissingRef(
              "missing-power-reference",
              entry.filePath,
              `Power reference "${reference.id}" does not exist.`
            )
          );
        }
        break;
      case "origin":
        if (!context.index.byId[reference.id]) {
          diagnostics.push(
            makeMissingRef(
              "missing-origin-reference",
              entry.filePath,
              `Origin reference "${reference.id}" does not exist.`
            )
          );
        }
        break;
      case "item_modifier":
        if (!context.index.byId[reference.id]) {
          diagnostics.push(
            makeMissingRef(
              "missing-item-modifier-reference",
              entry.filePath,
              `Item modifier reference "${reference.id}" does not exist.`
            )
          );
        }
        break;
      case "tag":
        if (!getTag(context.index, reference.id)) {
          diagnostics.push(
            makeMissingRef("missing-tag-reference", entry.filePath, `Tag reference "${reference.id}" does not exist.`)
          );
        }
        break;
      case "resource":
        if (!context.index.entries.some((candidate) => candidate.resourceDefinitions.includes(reference.id))) {
          diagnostics.push(
            makeMissingRef(
              "missing-resource-reference",
              entry.filePath,
              `Resource reference "${reference.id}" does not exist.`
            )
          );
        }
        break;
      default:
        break;
    }
  }

  return diagnostics;
}

function validateCommonRules(
  filePath: string,
  raw: string,
  data: Record<string, unknown>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const type = typeof data.type === "string" ? data.type : undefined;

  if (type === "origins:inverted") {
    diagnostics.push({
      id: "invalid-inverted-type",
      severity: "error",
      filePath,
      range: getLineRange(raw, `"origins:inverted"`),
      message: '`origins:inverted` nao e um type valido. Use `"inverted": true` dentro da propria condicao.',
      quickFix: {
        label: "Replace with inverted flag",
        replacement: '"inverted": true'
      }
    });
  }

  if (type === "origins:action_on_hit" && "chance" in data) {
    diagnostics.push({
      id: "action-on-hit-invalid-chance",
      severity: "error",
      filePath,
      range: getLineRange(raw, '"chance"'),
      message: "origins:action_on_hit nao aceita `chance` diretamente. Use `bientity_condition` com `origins:chance`."
    });
  }

  if (type === "origins:action_on_hit" && "condition" in data) {
    diagnostics.push({
      id: "action-on-hit-invalid-condition",
      severity: "error",
      filePath,
      range: getLineRange(raw, '"condition"'),
      message: "origins:action_on_hit nao aceita `condition` diretamente. Use `bientity_condition`, `damage_condition` ou condicoes especificas do contexto."
    });
  }

  if (type === "origins:active_self" && typeof data.cooldown === "number" && hasComplexConditionBranch(data.entity_action)) {
    diagnostics.push({
      id: "active-self-cooldown-warning",
      severity: "warning",
      filePath,
      message: "Se a acao pode falhar, considere separar cooldown em `origins:multiple` e acionar `trigger_cooldown` somente no branch de sucesso."
    });
  }

  if (type === "origins:multiple" && Object.keys(data).length <= 4) {
    diagnostics.push({
      id: "multiple-without-need",
      severity: "info",
      filePath,
      message: "`origins:multiple` e util para agrupar subpowers, mas nao e obrigatorio para toda habilidade."
    });
  }

  if (type === "origins:execute_command" && typeof data.command === "string") {
    const command = data.command;
    if (command.includes("effect give") || command.includes("playsound") || command.includes("particle")) {
      diagnostics.push({
        id: "prefer-native-action",
        severity: "warning",
        filePath,
        message: "`origins:execute_command` foi usado onde pode existir uma acao nativa equivalente, como `origins:apply_effect`, `origins:play_sound` ou `origins:spawn_particles`."
      });
    }
  }

  if (typeof data.interval === "number" && data.interval < 20) {
    diagnostics.push({
      id: "interval-too-low",
      severity: "warning",
      filePath,
      message: "interval menor que 20 pode ser pesado em runtime."
    });
  }

  return diagnostics;
}

function inferSchemaKind(entry: IndexedEntry): string {
  switch (entry.kind) {
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
      return "condition";
  }
}

function inferNestedSchemaKind(
  parentSchemaKind: string,
  key: string,
  value: unknown
): string | undefined {
  if (!isObject(value) && !Array.isArray(value)) return undefined;

  if (key === "bientity_action") return "bientity_action";
  if (
    key === "entity_action" ||
    key === "if_action" ||
    key === "else_action" ||
    key === "rising_action" ||
    key === "falling_action" ||
    key === "self_action" ||
    key === "attacker_action"
  ) {
    return "entity_action";
  }
  if (key === "actor_action" || key === "target_action") {
    return parentSchemaKind === "bientity_action" ? "bientity_action" : "entity_action";
  }
  if (key === "condition" || key === "entity_condition" || key === "target_condition") {
    return "condition";
  }
  if (key === "bientity_condition") return "bientity_condition";
  if (key === "item_condition") return "item_condition";
  if (key === "damage_condition") return "damage_condition";
  if (key === "actions" || key === "conditions") return parentSchemaKind;

  return undefined;
}

function hasSchemaKind(registry: SchemaRegistry, kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(registry.typesByKind, kind);
}

function isLikelySubpower(type: string, key: string, value: unknown): boolean {
  return type === "origins:multiple" && isObject(value) && key !== "type";
}

function hasComplexConditionBranch(value: unknown): boolean {
  if (!isObject(value)) return false;
  return value.type === "origins:if_else" || value.type === "origins:if_else_list";
}

function makeMissingRef(id: string, filePath: string, message: string): Diagnostic {
  return {
    id,
    severity: "error",
    filePath,
    message
  };
}

export function explainDiagnostic(id: string): string {
  const explanations: Record<string, string> = {
    "action-on-hit-invalid-chance":
      "Use `bientity_condition` with an `origins:chance` condition instead of placing `chance` at the top level.",
    "action-on-hit-invalid-condition":
      "Top-level `condition` is not part of `origins:action_on_hit`. Move the logic into the appropriate contextual condition field.",
    "invalid-inverted-type":
      "`origins:inverted` is not a standalone type. Use `inverted: true` on the existing condition object."
  };

  return explanations[id] ?? "No extended explanation is registered for this diagnostic yet.";
}
