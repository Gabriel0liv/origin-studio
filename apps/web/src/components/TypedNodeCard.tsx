import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function TypedNodeCard({
  title,
  type,
  description,
  children,
  defaultOpen = true
}: {
  title: string;
  type?: string | undefined;
  description?: string | undefined;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="typed-node-card" open={defaultOpen}>
      <summary>
        <span className="typed-node-summary">
          <span className="typed-node-title">{title}</span>
          {type ? <strong>{type}</strong> : null}
        </span>
        <span className="typed-node-icon">
          <ChevronRight size={16} />
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="typed-node-body">
        {description ? <p>{description}</p> : null}
        {children}
      </div>
    </details>
  );
}
