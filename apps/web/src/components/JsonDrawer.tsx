import * as Dialog from "@radix-ui/react-dialog";
import MonacoEditor from "@monaco-editor/react";
import type { editor as MonacoEditorApi } from "monaco-editor";

export function JsonDrawer({
  open,
  value,
  fileKind,
  onOpenChange,
  onEditorMount,
  onChange
}: {
  open: boolean;
  value: string;
  fileKind?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onEditorMount: (editor: MonacoEditorApi.IStandaloneCodeEditor) => void;
  onChange: (value: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="json-drawer-overlay" />
        <Dialog.Content className="json-drawer">
          <div className="json-drawer-header">
            <div>
              <Dialog.Title>Advanced JSON</Dialog.Title>
              <Dialog.Description>Edit the real file directly and keep the builder in sync.</Dialog.Description>
            </div>
            <Dialog.Close className="ghost-button compact">Close</Dialog.Close>
          </div>
          <div className="json-drawer-body">
            <MonacoEditor
              height="100%"
              defaultLanguage={fileKind === "function" ? "plaintext" : "json"}
              value={value}
              onMount={(editor) => onEditorMount(editor)}
              onChange={(nextValue) => onChange(nextValue ?? "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
