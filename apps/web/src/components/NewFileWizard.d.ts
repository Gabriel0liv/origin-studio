import type { NewFileDraft, SchemaType } from "../types";
export declare function NewFileWizard({ open, draft, namespaces, powerTypes, onOpenChange, onDraftChange, onCreate }: {
    open: boolean;
    draft: NewFileDraft;
    namespaces: string[];
    powerTypes: SchemaType[];
    onOpenChange: (open: boolean) => void;
    onDraftChange: (next: NewFileDraft) => void;
    onCreate: () => void;
}): import("react").JSX.Element;
