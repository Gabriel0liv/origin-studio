import type { Diagnostic, LookupEntry, SchemaType } from "../types";
import { isObject } from "../utils";
import { SchemaForm } from "./SchemaForm";

export function TagBuilder(props: {
  value: unknown;
  schema: SchemaType | null;
  diagnostics: Diagnostic[];
  optionsByKind: Record<string, SchemaType[]>;
  lookup: Record<string, LookupEntry>;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
  onOpenReference: (path: string) => void;
  onFieldFocus?: (path: Array<string | number>, field: import("../types").SchemaField) => void;
}) {
  if (!isObject(props.value)) {
    return <div className="builder-empty">This tag cannot be rendered as a structured builder yet.</div>;
  }

  return <SchemaForm {...props} value={props.value} />;
}
