import type { editor as MonacoEditorApi } from "monaco-editor";
export declare function JsonDrawer({ open, value, fileKind, onOpenChange, onEditorMount, onChange }: {
    open: boolean;
    value: string;
    fileKind?: string | undefined;
    onOpenChange: (open: boolean) => void;
    onEditorMount: (editor: MonacoEditorApi.IStandaloneCodeEditor) => void;
    onChange: (value: string) => void;
}): import("react").JSX.Element;
