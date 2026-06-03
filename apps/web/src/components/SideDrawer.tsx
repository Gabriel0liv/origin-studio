import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function SideDrawer({
  open,
  title,
  description,
  onOpenChange,
  children
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="json-drawer-overlay" />
        <Dialog.Content className="side-drawer">
          <div className="json-drawer-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="ghost-button compact">Close</Dialog.Close>
          </div>
          <div className="side-drawer-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
