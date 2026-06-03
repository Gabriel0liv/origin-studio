export function FunctionEditor({
  raw,
  onOpenJson
}: {
  raw: string;
  onOpenJson: () => void;
}) {
  return (
    <section className="builder-empty compact-builder">
      <div className="builder-empty-copy">
        <h3>Function editor</h3>
        <p>Functions stay text-first in the MVP. Open the JSON drawer to edit the real file directly.</p>
      </div>
      <pre className="json-preview function-preview">{raw || "# Empty function"}</pre>
      <div className="builder-empty-actions">
        <button className="ghost-button" onClick={onOpenJson}>
          Open JSON
        </button>
      </div>
    </section>
  );
}
