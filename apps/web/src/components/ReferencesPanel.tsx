import { Copy, ExternalLink } from "lucide-react";
import type { DefinitionItem, FileReference, ReferenceItem } from "../types";
import { copyToClipboard } from "../utils";

export function ReferencesPanel({
  referenceGroups,
  definitionsCreated,
  incomingReferences,
  onOpenFile
}: {
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
}) {
  return (
    <section className="inspector-card">
      <div className="inspector-card-header">
        <h3>References</h3>
        <p>Open, copy, and inspect related IDs without leaving the builder.</p>
      </div>

      <ReferenceGroup title="Used by this file" items={referenceGroups.powers} emptyText="No power references." onOpenFile={onOpenFile} />
      <ReferenceGroup title="Tags" items={referenceGroups.tags} emptyText="No tag references." onOpenFile={onOpenFile} />
      <ReferenceGroup
        title="Item Modifiers"
        items={referenceGroups.itemModifiers}
        emptyText="No item modifier references."
        onOpenFile={onOpenFile}
      />
      <ReferenceGroup title="Resources" items={referenceGroups.resources} emptyText="No resource references." onOpenFile={onOpenFile} />
      <ReferenceGroup title="Functions" items={referenceGroups.functions} emptyText="No function references." onOpenFile={onOpenFile} />

      <DefinitionGroup title="Defined by this file" items={definitionsCreated} />
      <IncomingGroup items={incomingReferences} onOpenFile={onOpenFile} />
    </section>
  );
}

function ReferenceGroup({
  title,
  items,
  emptyText,
  onOpenFile
}: {
  title: string;
  items: ReferenceItem[];
  emptyText: string;
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="inspector-group">
      <h4>{title}</h4>
      {items.length === 0 ? <p className="empty-state compact">{emptyText}</p> : null}
      {items.map((item) => (
        <ReferenceRow
          key={`${item.kind}-${item.id}`}
          id={item.id}
          kind={item.kind}
          status={item.status}
          {...(item.path ? { path: item.path } : {})}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function DefinitionGroup({ title, items }: { title: string; items: DefinitionItem[] }) {
  return (
    <div className="inspector-group">
      <h4>{title}</h4>
      {items.length === 0 ? <p className="empty-state compact">No definitions in this file.</p> : null}
      {items.map((item) => (
        <ReferenceRow
          key={`${item.kind}-${item.id}`}
          id={item.id}
          kind={item.kind}
          status="found"
          {...(item.path ? { path: item.path } : {})}
        />
      ))}
    </div>
  );
}

function IncomingGroup({
  items,
  onOpenFile
}: {
  items: FileReference[];
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="inspector-group">
      <h4>Files referencing this file</h4>
      {items.length === 0 ? <p className="empty-state compact">No incoming references found.</p> : null}
      {items.map((item, index) => (
        <ReferenceRow
          key={`${item.sourcePath}-${index}`}
          id={item.id}
          kind={item.kind}
          path={item.sourcePath}
          status="found"
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function ReferenceRow({
  id,
  kind,
  path,
  status,
  onOpenFile
}: {
  id: string;
  kind: string;
  path?: string | undefined;
  status: "found" | "missing";
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  return (
    <div className="inspector-reference-row">
      <div>
        <strong>{id}</strong>
        <small>{kind}</small>
        {path ? <code>{path}</code> : null}
      </div>
      <div className="inspector-reference-actions">
        <span className={`status-tag ${status}`}>{status}</span>
        <button className="ghost-button compact" onClick={() => void copyToClipboard(id)}>
          <Copy size={14} />
          Copy
        </button>
        {path && onOpenFile ? (
          <button className="ghost-button compact" onClick={() => onOpenFile(path)}>
            <ExternalLink size={14} />
            Open
          </button>
        ) : null}
      </div>
    </div>
  );
}
