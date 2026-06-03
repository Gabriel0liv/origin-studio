import type { Diagnostic, LookupEntry, SchemaField, SchemaType } from "../types";
import { isObject, startCase } from "../utils";
import { FieldRenderer, readOptionalFieldValue } from "./FieldRenderer";

const identityFields = ["type", "name", "description", "hidden", "loading_priority"];

export function SchemaForm({
  value,
  schema,
  diagnostics,
  optionsByKind,
  lookup,
  onValueChange,
  onOpenReference,
  onFieldFocus
}: {
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
  const visibleSchemaFields = allFields.filter((field) => !identityFields.includes(field.name));
  const optionalFields = visibleSchemaFields.filter((field) => !(field.name in value));
  const customFields = Object.keys(value).filter(
    (key) => !new Set([...identityFields, ...visibleSchemaFields.map((field) => field.name)]).has(key)
  );

  return (
    <div className="schema-form">
      <section className="builder-section">
        <div className="builder-section-copy">
          <h3>Identity</h3>
          <p>Core metadata and the selected type for this document.</p>
        </div>
        <div className="builder-section-fields">
          {identityFields
            .filter((fieldName) => fieldName === "type" || fieldName in value || fieldName === "name" || fieldName === "description")
            .map((fieldName) => (
              <FieldRenderer
                key={fieldName}
                label={startCase(fieldName)}
                path={[fieldName]}
                value={value[fieldName]}
                field={{
                  name: fieldName,
                  type: fieldName === "hidden" ? "boolean" : "string",
                  required: fieldName === "type",
                  ...(fieldName === "type" ? { nestedKind: schema?.kind ?? "power" } : {})
                }}
                diagnostics={diagnostics}
                optionsByKind={optionsByKind}
                lookup={lookup}
                onValueChange={onValueChange}
                onOpenReference={onOpenReference}
                {...(onFieldFocus ? { onFieldFocus } : {})}
              />
            ))}
        </div>
      </section>

      <section className="builder-section">
        <div className="builder-section-copy">
          <h3>Configuration</h3>
          <p>Schema-driven fields for the selected type.</p>
        </div>
        <div className="builder-section-fields">
          {visibleSchemaFields
            .filter((field) => field.name in value)
            .map((field) => (
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
          {visibleSchemaFields.filter((field) => field.name in value).length === 0 ? (
            <p className="empty-state">No schema fields are currently filled for this type.</p>
          ) : null}
        </div>
      </section>

      <details className="builder-section optional-section">
        <summary>
          <div className="builder-section-copy">
            <h3>Optional Fields</h3>
            <p>Add optional fields from the active schema when you need them.</p>
          </div>
        </summary>
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
      </details>

      <section className="builder-section">
        <div className="builder-section-copy">
          <h3>Custom Fields</h3>
          <p>Unrecognized fields are preserved and editable as raw JSON-friendly inputs.</p>
        </div>
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
      </section>
    </div>
  );
}

function inferCustomType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (isObject(value)) return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}
