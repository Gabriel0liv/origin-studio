import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function SidePanelDrawer({
  open,
  title,
  description,
  onOpenChange,
  children
}: {
  open: boolean;
  title: string;
  description?: string | undefined;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="json-drawer-overlay" />
        <Dialog.Content className="side-drawer">
          <div className="side-drawer-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description ? <Dialog.Description>{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="ghost-button compact">Close</Dialog.Close>
          </div>
          <div className="side-drawer-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
