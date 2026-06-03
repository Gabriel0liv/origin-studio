import type { Diagnostic, LookupEntry, SchemaType } from "../types";
export declare function OriginBuilder(props: {
    value: unknown;
    schema: SchemaType | null;
    diagnostics: Diagnostic[];
    optionsByKind: Record<string, SchemaType[]>;
    lookup: Record<string, LookupEntry>;
    onValueChange: (path: Array<string | number>, value: unknown) => void;
    onOpenReference: (path: string) => void;
    onFieldFocus?: (path: Array<string | number>, field: import("../types").SchemaField) => void;
}): import("react").JSX.Element;
