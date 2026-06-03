import type { Diagnostic, LookupEntry, SchemaField, SchemaType } from "../types";
export declare function SchemaForm({ value, schema, diagnostics, optionsByKind, lookup, onValueChange, onOpenReference, onFieldFocus }: {
    value: Record<string, unknown>;
    schema: SchemaType | null;
    diagnostics: Diagnostic[];
    optionsByKind: Record<string, SchemaType[]>;
    lookup: Record<string, LookupEntry>;
    onValueChange: (path: Array<string | number>, value: unknown) => void;
    onOpenReference: (path: string) => void;
    onFieldFocus?: ((path: Array<string | number>, field: SchemaField) => void) | undefined;
}): import("react").JSX.Element;
