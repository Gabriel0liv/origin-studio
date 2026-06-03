import type { Diagnostic, LookupEntry, SchemaField, SchemaType } from "../types";
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
export declare function FieldRenderer(props: RendererProps): import("react").JSX.Element;
export declare function readOptionalFieldValue(target: unknown, field: SchemaField): unknown;
export {};
