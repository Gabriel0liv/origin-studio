import type { DefinitionItem, FileReference, ReferenceItem } from "../types";
export declare function ReferencesPanel({ referenceGroups, definitionsCreated, incomingReferences, onOpenFile }: {
    referenceGroups: {
        powers: ReferenceItem[];
        tags: ReferenceItem[];
        itemModifiers: ReferenceItem[];
        resources: ReferenceItem[];
        functions: ReferenceItem[];
    };
    definitionsCreated: DefinitionItem[];
    incomingReferences: FileReference[];
    onOpenFile: (path: string) => void;
}): import("react").JSX.Element;
