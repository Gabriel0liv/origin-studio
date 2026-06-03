import type { ReactNode } from "react";

export function BuilderLayout({
  header,
  builder,
  inspector
}: {
  header: ReactNode;
  builder: ReactNode;
  inspector: ReactNode;
}) {
  return (
    <main className="workspace">
      <div className="editor-layout">
        <section className="builder-pane">
          {header}
          <div className="builder-scroll">{builder}</div>
        </section>
        <aside className="inspector-pane">
          <div className="inspector-scroll">{inspector}</div>
        </aside>
      </div>
    </main>
  );
}
