import * as Dialog from "@radix-ui/react-dialog";
import type { NewFileDraft, NewFileKind, SchemaType } from "../types";
import { labelForKind } from "../utils";

export function NewFileWizard({
  open,
  draft,
  namespaces,
  powerTypes,
  onOpenChange,
  onDraftChange,
  onCreate
}: {
  open: boolean;
  draft: NewFileDraft;
  namespaces: string[];
  powerTypes: SchemaType[];
  onOpenChange: (open: boolean) => void;
  onDraftChange: (next: NewFileDraft) => void;
  onCreate: () => void;
}) {
  const title = wizardTitle(draft.kind);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="json-drawer-overlay" />
        <Dialog.Content className="wizard-dialog">
          <div className="json-drawer-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>Create a real file on disk and open it in the visual builder.</Dialog.Description>
            </div>
            <Dialog.Close className="ghost-button compact">Close</Dialog.Close>
          </div>

          <div className="wizard-body">
            <label className="field-row">
              <span>Namespace</span>
              <select value={draft.namespace} onChange={(event) => onDraftChange({ ...draft, namespace: event.target.value })}>
                {namespaces.map((namespace) => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-row">
              <span>Path</span>
              <input value={draft.path} onChange={(event) => onDraftChange({ ...draft, path: event.target.value })} />
            </label>

            {draft.kind === "power" || draft.kind === "item_modifier" ? (
              <label className="field-row">
                <span>Type</span>
                <select value={draft.type ?? ""} onChange={(event) => onDraftChange({ ...draft, type: event.target.value })}>
                  {powerTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {draft.kind === "tag" ? (
              <label className="field-row">
                <span>Tag Kind</span>
                <select value={draft.tagFolder ?? "items"} onChange={(event) => onDraftChange({ ...draft, tagFolder: event.target.value })}>
                  <option value="items">items</option>
                  <option value="blocks">blocks</option>
                  <option value="entity_types">entity_types</option>
                  <option value="damage_type">damage_type</option>
                  <option value="fluids">fluids</option>
                </select>
              </label>
            ) : null}

            <label className="field-row">
              <span>Name</span>
              <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} />
            </label>

            <label className="field-row">
              <span>Description</span>
              <textarea value={draft.description} rows={3} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} />
            </label>

            {draft.kind === "origin" ? (
              <>
                <label className="field-row">
                  <span>Icon</span>
                  <input value={draft.icon ?? ""} onChange={(event) => onDraftChange({ ...draft, icon: event.target.value })} />
                </label>
                <div className="wizard-grid">
                  <label className="field-row">
                    <span>Impact</span>
                    <input
                      type="number"
                      value={String(draft.impact ?? 1)}
                      onChange={(event) => onDraftChange({ ...draft, impact: Number(event.target.value) })}
                    />
                  </label>
                  <label className="field-row">
                    <span>Order</span>
                    <input
                      type="number"
                      value={String(draft.order ?? 0)}
                      onChange={(event) => onDraftChange({ ...draft, order: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </>
            ) : null}

            <div className="wizard-footer">
              <div>
                <strong>{labelForKind(draft.kind)}</strong>
                <p>Creates a JSON file in the expected datapack folder.</p>
              </div>
              <button className="primary-button" onClick={onCreate} disabled={!draft.namespace.trim() || !draft.path.trim()}>
                Create File
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function wizardTitle(kind: NewFileKind): string {
  switch (kind) {
    case "power":
      return "New Power";
    case "origin":
      return "New Origin";
    case "origin_layer":
      return "New Origin Layer";
    case "item_modifier":
      return "New Item Modifier";
    case "tag":
      return "New Tag";
  }
}
