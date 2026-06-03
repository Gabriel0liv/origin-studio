import type { SchemaType } from "../types";
export declare function TypeSelector({ value, options, kind, onChange }: {
    value?: string | undefined;
    options: SchemaType[];
    kind: string;
    onChange: (value: string) => void;
}): import("react").JSX.Element;
