export function FileHeader({
  kindLabel,
  fileName,
  directory,
  absolutePath,
  dirty,
  problemCount,
  onSave,
  onReload,
  onOpenJson,
  onOpenProblems,
  onOpenReferences,
  onOpenInspector,
  onOpenSchema
}: {
  kindLabel: string;
  fileName?: string | undefined;
  directory?: string | undefined;
  absolutePath?: string | undefined;
  dirty: boolean;
  problemCount: number;
  onSave: () => void;
  onReload: () => void;
  onOpenJson: () => void;
  onOpenProblems: () => void;
  onOpenReferences: () => void;
  onOpenInspector: () => void;
  onOpenSchema: () => void;
}) {
  return (
    <header className="file-header">
      <div className="file-header-copy" title={absolutePath}>
        <div className="file-header-mainline">
          <small>{kindLabel}</small>
          <h2>{fileName ?? "Untitled file"}</h2>
          <span className={`status-pill ${dirty ? "dirty" : "saved"}`}>{dirty ? "Modified" : "Saved"}</span>
        </div>
        <p>{directory ?? "No relative path available"}</p>
      </div>
      <div className="editor-actions">
        <button className="ghost-button" onClick={onReload}>
          Reload
        </button>
        <button className="ghost-button" onClick={onOpenInspector}>
          Inspector
        </button>
        <button className="ghost-button" onClick={onOpenProblems}>
          Problems {problemCount > 0 ? `(${problemCount})` : ""}
        </button>
        <button className="ghost-button" onClick={onOpenReferences}>
          References
        </button>
        <button className="ghost-button" onClick={onOpenSchema}>
          Schema
        </button>
        <button className="ghost-button" onClick={onOpenJson}>
          JSON
        </button>
        <button className="primary-button" onClick={onSave}>
          Save
        </button>
      </div>
    </header>
  );
}
