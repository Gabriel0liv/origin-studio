import type { ReactNode } from "react";

export function AppShell({
  sidebar,
  children
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      {sidebar}
      {children}
    </div>
  );
}
