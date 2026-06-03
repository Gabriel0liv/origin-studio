import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Diagnostic, LookupEntry, SchemaField, SchemaType } from "../types";
import {
  copyToClipboard,
  getInlineProblems,
  getValueAtPath,
  inferFieldType,
  isObject,
  startCase
} from "../utils";
import { TypeSelector } from "./TypeSelector";
import { TypedNodeCard } from "./TypedNodeCard";

type RendererProps = {
  label: string;
  path: Array<string | number>;
  value: unknown;
  field: SchemaField;
  diagnostics: Diagnostic[];
  optionsByKind: Record<string, SchemaType[]>;
  lookup: Record<string, LookupEntry>;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
  onOpenReference: (path: string) => void;
  onFieldFocus?: ((path: Array<string | number>, field: SchemaField) => void) | undefined;
};

export function FieldRenderer(props: RendererProps) {
  const { label, path, value, field } = props;

  if (field.name === "type") {
    const kind = field.nestedKind ?? inferKindFromField(field);
    return (
      <FieldShell {...props}>
        <TypeSelector
          value={typeof value === "string" ? value : undefined}
          options={props.optionsByKind[kind] ?? []}
          kind={kind}
          onChange={(nextType) => props.onValueChange(path, nextType)}
        />
      </FieldShell>
    );
  }

  if (Array.isArray(value)) {
    return <ArrayFieldRenderer {...props} />;
  }

  if (isObject(value)) {
    return <ObjectFieldRenderer {...props} />;
  }

  const allowedValues = field.allowedValues?.filter((item) => !item.startsWith("$")) ?? [];

  return (
    <FieldShell {...props}>
      {allowedValues.length > 0 ? (
        <select value={String(value ?? "")} onChange={(event) => props.onValueChange(path, event.target.value)}>
          <option value="">Select a value</option>
          {allowedValues.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : typeof value === "boolean" ? (
        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => props.onValueChange(path, event.target.checked)}
          />
          <span>{value ? "Enabled" : "Disabled"}</span>
        </label>
      ) : typeof value === "number" ? (
        <input
          type="number"
          value={String(value)}
          onChange={(event) => props.onValueChange(path, Number(event.target.value))}
        />
      ) : isReferenceField(field) ? (
        <ReferenceField {...props} />
      ) : isLongTextField(field) ? (
        <textarea value={String(value ?? "")} rows={4} onChange={(event) => props.onValueChange(path, event.target.value)} />
      ) : (
        <input value={String(value ?? "")} onChange={(event) => props.onValueChange(path, event.target.value)} />
      )}
    </FieldShell>
  );
}

function FieldShell({
  label,
  path,
  value,
  field,
  diagnostics,
  onFieldFocus,
  children
}: RendererProps & { children: ReactNode }) {
  const inlineProblems = getInlineProblems(diagnostics, path, value);

  return (
    <label
      className={`field-row ${inlineProblems.length > 0 ? "has-problem" : ""}`}
      onClick={() => onFieldFocus?.(path, field)}
    >
      <span className="field-title">
        {label}
        {field.required ? " *" : ""}
      </span>
      {field.description ? <small>{field.description}</small> : null}
      {children}
      {inlineProblems.map((problem) => (
        <div key={`${problem.id}-${problem.message}`} className={`inline-problem ${problem.severity}`}>
          <strong>{problem.id}</strong>
          <p>{problem.message}</p>
        </div>
      ))}
    </label>
  );
}

function ReferenceField(props: RendererProps) {
  const value = typeof props.value === "string" ? props.value : "";
  const entry = props.lookup[value];
  const status = value ? (entry ? "found" : "missing") : "idle";

  return (
    <div className="reference-field">
      <input value={value} onChange={(event) => props.onValueChange(props.path, event.target.value)} />
      <div className="reference-field-actions">
        <span className={`status-tag ${status === "missing" ? "missing" : "found"}`}>
          {status === "idle" ? "custom" : status}
        </span>
        <button type="button" className="ghost-button compact" onClick={() => void copyToClipboard(value)} disabled={!value}>
          <Copy size={14} />
          Copy
        </button>
        {entry?.path ? (
          <button type="button" className="ghost-button compact" onClick={() => props.onOpenReference(entry.path)}>
            <ExternalLink size={14} />
            Open
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ObjectFieldRenderer(props: RendererProps) {
  const { label, path, value, field } = props;
  const objectValue = isObject(value) ? value : {};

  return (
    <TypedNodeCard title={label} type={typeof objectValue.type === "string" ? objectValue.type : field.type} description={field.description}>
      <div className="typed-node-fields">
        {Object.entries(objectValue).map(([key, child]) => (
          <FieldRenderer
            key={key}
            {...props}
            label={startCase(key)}
            path={[...path, key]}
            value={child}
            field={buildGeneratedField(key, child)}
          />
        ))}
      </div>
    </TypedNodeCard>
  );
}

function ArrayFieldRenderer(props: RendererProps) {
  const items = Array.isArray(props.value) ? props.value : [];

  return (
    <TypedNodeCard title={props.label} type={`${items.length} items`} description={props.field.description}>
      <div className="typed-node-fields">
        {items.map((item, index) => (
          <div key={`${props.field.name}-${index}`} className="array-item-row">
            <div className="array-item-toolbar">
              <span>Item {index + 1}</span>
              <button
                type="button"
                className="ghost-button compact"
                onClick={() => props.onValueChange(props.path, items.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>
            <FieldRenderer
              {...props}
              label={`${props.label} ${index + 1}`}
              path={[...props.path, index]}
              value={item}
              field={buildArrayField(props.field, index, item)}
            />
          </div>
        ))}
        <button
          type="button"
          className="ghost-button compact"
          onClick={() => props.onValueChange(props.path, [...items, buildEmptyValue(props.field.arrayItemType ?? "string")])}
        >
          <Plus size={14} />
          Add Item
        </button>
      </div>
    </TypedNodeCard>
  );
}

function inferKindFromField(field: SchemaField): string {
  if (field.nestedKind) return field.nestedKind;
  if (field.name === "type") return "power";
  return "power";
}

function inferKindFromKey(key: string): string | undefined {
  if (key === "bientity_action") return "bientity_action";
  if (key === "entity_action" || key.endsWith("_action") || key === "action") return "entity_action";
  if (key === "bientity_condition") return "bientity_condition";
  if (key === "condition" || key.endsWith("_condition")) return "condition";
  if (key === "item_condition") return "item_condition";
  if (key === "damage_condition") return "damage_condition";
  return undefined;
}

function isReferenceField(field: SchemaField): boolean {
  return ["power", "resource", "tag", "item_modifier", "function"].some((token) => field.name.includes(token));
}

function isLongTextField(field: SchemaField): boolean {
  return ["description", "command", "nbt"].includes(field.name);
}

function buildEmptyValue(type: string): unknown {
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "object") return {};
  if (type === "array" || type === "list") return [];
  return "";
}

function buildGeneratedField(name: string, value: unknown): SchemaField {
  const nestedKind = inferKindFromKey(name);

  return {
    name,
    type: inferFieldType(value),
    required: false,
    ...(nestedKind ? { nestedKind } : {})
  };
}

function buildArrayField(field: SchemaField, index: number, value: unknown): SchemaField {
  return {
    name: `${field.name}[${index}]`,
    type: field.arrayItemType ?? inferFieldType(value),
    required: false,
    ...(field.nestedKind ? { nestedKind: field.nestedKind } : {})
  };
}

export function readOptionalFieldValue(target: unknown, field: SchemaField): unknown {
  const current = getValueAtPath(target, [field.name]);
  if (current !== undefined) return current;
  return buildEmptyValue(field.type);
}
