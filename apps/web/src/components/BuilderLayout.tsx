import type { ReactNode } from "react";

export function BuilderLayout({
  header,
  builder
}: {
  header: ReactNode;
  builder: ReactNode;
}) {
  return (
    <main className="workspace">
      <section className="editor">
        {header}
        <div className="editor-body">{builder}</div>
      </section>
    </main>
  );
}
