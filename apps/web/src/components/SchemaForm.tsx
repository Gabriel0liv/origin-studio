import type { ReactNode } from "react";
import type { Diagnostic, LookupEntry, SchemaField, SchemaType } from "../types";
import { isObject, startCase } from "../utils";
import { FieldRenderer, readOptionalFieldValue } from "./FieldRenderer";

export function SchemaForm({
  kind,
  value,
  schema,
  diagnostics,
  optionsByKind,
  lookup,
  onValueChange,
  onOpenReference,
  onFieldFocus
}: {
  kind: string;
  value: Record<string, unknown>;
  schema: SchemaType | null;
  diagnostics: Diagnostic[];
  optionsByKind: Record<string, SchemaType[]>;
  lookup: Record<string, LookupEntry>;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
  onOpenReference: (path: string) => void;
  onFieldFocus?: ((path: Array<string | number>, field: SchemaField) => void) | undefined;
}) {
  const allFields = schema?.fields ?? [];
  const identityNames = getIdentityFields(kind, value);
  const advancedNames = new Set(["hidden", "loading_priority", "badges", "unchoosable", "enabled", "replace"]);
  const displayNames = new Set(["icon", "impact", "order"]);

  const visibleSchemaFields = allFields.filter((field) => !identityNames.includes(field.name));
  const knownFieldNames = new Set([...identityNames, ...visibleSchemaFields.map((field) => field.name)]);
  const customFields = Object.keys(value).filter((key) => !knownFieldNames.has(key));

  const basicFields = identityNames.filter((name) => name in value || name === "name" || name === "description");
  const displayFields = visibleSchemaFields.filter((field) => displayNames.has(field.name) && field.name in value);
  const advancedFields = visibleSchemaFields.filter((field) => advancedNames.has(field.name) && field.name in value);
  const configurationFields = visibleSchemaFields.filter(
    (field) => !displayNames.has(field.name) && !advancedNames.has(field.name) && field.name in value
  );
  const optionalFields = visibleSchemaFields.filter((field) => !(field.name in value));

  return (
    <div className="schema-form compact">
      <SchemaSection title={sectionTitle(kind, "basic")} defaultOpen>
        {basicFields.map((fieldName) => (
          <FieldRenderer
            key={fieldName}
            label={startCase(fieldName)}
            path={[fieldName]}
            value={value[fieldName]}
            field={buildIdentityField(kind, schema, fieldName)}
            diagnostics={diagnostics}
            optionsByKind={optionsByKind}
            lookup={lookup}
            onValueChange={onValueChange}
            onOpenReference={onOpenReference}
            {...(onFieldFocus ? { onFieldFocus } : {})}
          />
        ))}
      </SchemaSection>

      {displayFields.length > 0 ? (
        <SchemaSection title="Icon & Display" defaultOpen={kind === "origin"}>
          {displayFields.map((field) => (
            <FieldRenderer
              key={field.name}
              label={startCase(field.name)}
              path={[field.name]}
              value={value[field.name]}
              field={field}
              diagnostics={diagnostics}
              optionsByKind={optionsByKind}
              lookup={lookup}
              onValueChange={onValueChange}
              onOpenReference={onOpenReference}
              {...(onFieldFocus ? { onFieldFocus } : {})}
            />
          ))}
        </SchemaSection>
      ) : null}

      <SchemaSection title={sectionTitle(kind, "configuration")} defaultOpen>
        {configurationFields.map((field) => (
          <FieldRenderer
            key={field.name}
            label={startCase(field.name)}
            path={[field.name]}
            value={value[field.name]}
            field={field}
            diagnostics={diagnostics}
            optionsByKind={optionsByKind}
            lookup={lookup}
            onValueChange={onValueChange}
            onOpenReference={onOpenReference}
            {...(onFieldFocus ? { onFieldFocus } : {})}
          />
        ))}
        {configurationFields.length === 0 ? <p className="empty-state compact">No direct configuration fields in this section.</p> : null}
      </SchemaSection>

      <SchemaSection title="Optional Fields">
        <div className="optional-grid">
          {optionalFields.map((field) => (
            <button
              key={field.name}
              type="button"
              className="optional-field"
              onClick={() => onValueChange([field.name], readOptionalFieldValue(value, field))}
            >
              <strong>{startCase(field.name)}</strong>
              <small>{field.description ?? "Optional schema field"}</small>
            </button>
          ))}
          {optionalFields.length === 0 ? <p className="empty-state compact">No optional fields available.</p> : null}
        </div>
      </SchemaSection>

      <SchemaSection title="Advanced">
        <div className="builder-section-fields">
          {advancedFields.map((field) => (
            <FieldRenderer
              key={field.name}
              label={startCase(field.name)}
              path={[field.name]}
              value={value[field.name]}
              field={field}
              diagnostics={diagnostics}
              optionsByKind={optionsByKind}
              lookup={lookup}
              onValueChange={onValueChange}
              onOpenReference={onOpenReference}
              {...(onFieldFocus ? { onFieldFocus } : {})}
            />
          ))}
          {advancedFields.length === 0 ? <p className="empty-state compact">No advanced fields in use.</p> : null}
        </div>
      </SchemaSection>

      <SchemaSection title="Custom Fields">
        <div className="builder-section-fields">
          {customFields.map((fieldName) => (
            <FieldRenderer
              key={fieldName}
              label={fieldName}
              path={[fieldName]}
              value={value[fieldName]}
              field={{
                name: fieldName,
                type: inferCustomType(value[fieldName]),
                required: false
              }}
              diagnostics={diagnostics}
              optionsByKind={optionsByKind}
              lookup={lookup}
              onValueChange={onValueChange}
              onOpenReference={onOpenReference}
              {...(onFieldFocus ? { onFieldFocus } : {})}
            />
          ))}
          {customFields.length === 0 ? <p className="empty-state compact">No custom fields in this document.</p> : null}
        </div>
      </SchemaSection>
    </div>
  );
}

function SchemaSection({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="builder-section collapsible" open={defaultOpen}>
      <summary className="builder-section-summary">
        <h3>{title}</h3>
      </summary>
      <div className="builder-section-body">{children}</div>
    </details>
  );
}

function getIdentityFields(kind: string, value: Record<string, unknown>): string[] {
  switch (kind) {
    case "origin":
      return ["name", "description"];
    case "origin_layer":
      return ["name", "description"];
    case "tag":
      return ["replace"];
    default:
      return ["type", "name", "description"];
  }
}

function buildIdentityField(kind: string, schema: SchemaType | null, fieldName: string): SchemaField {
  if (fieldName === "type") {
    return {
      name: "type",
      type: "string",
      required: true,
      nestedKind: schema?.kind ?? (kind === "power" ? "power" : kind)
    };
  }

  if (fieldName === "hidden" || fieldName === "replace") {
    return { name: fieldName, type: "boolean", required: false };
  }

  return { name: fieldName, type: "string", required: fieldName === "name" };
}

function inferCustomType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (isObject(value)) return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function sectionTitle(kind: string, section: "basic" | "configuration"): string {
  if (section === "basic") return "Basic";

  switch (kind) {
    case "power":
      return "Configuration";
    case "origin":
      return "Powers";
    case "origin_layer":
      return "Origins";
    case "item_modifier":
      return "Modifier Steps";
    case "tag":
      return "Values";
    default:
      return "Configuration";
  }
}
