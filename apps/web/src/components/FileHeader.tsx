export function FileHeader({
  kindLabel,
  fileName,
  directory,
  absolutePath,
  dirty,
  onSave,
  onReload,
  onOpenJson
}: {
  kindLabel: string;
  fileName?: string | undefined;
  directory?: string | undefined;
  absolutePath?: string | undefined;
  dirty: boolean;
  onSave: () => void;
  onReload: () => void;
  onOpenJson: () => void;
}) {
  return (
    <header className="file-header">
      <div className="file-header-copy" title={absolutePath}>
        <small>{kindLabel}</small>
        <h2>{fileName ?? "Untitled file"}</h2>
        <p>{directory ?? "No relative path available"}</p>
      </div>
      <div className="editor-actions">
        <span className={`status-pill ${dirty ? "dirty" : "saved"}`}>{dirty ? "Modified" : "Saved"}</span>
        <button className="ghost-button" onClick={onReload}>
          Reload
        </button>
        <button className="ghost-button" onClick={onOpenJson}>
          Open JSON
        </button>
        <button className="primary-button" onClick={onSave}>
          Save
        </button>
      </div>
    </header>
  );
}
