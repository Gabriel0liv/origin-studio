export function JsonOnlyEditor({
  title,
  description,
  onOpenJson
}: {
  title: string;
  description: string;
  onOpenJson: () => void;
}) {
  return (
    <section className="builder-empty compact-builder">
      <div className="builder-empty-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="builder-empty-actions">
        <button className="ghost-button" onClick={onOpenJson}>
          Open JSON
        </button>
      </div>
    </section>
  );
}
