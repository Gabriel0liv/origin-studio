import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SchemaType } from "../types";

export function TypeSelector({
  value,
  options,
  kind,
  onChange
}: {
  value?: string | undefined;
  options: SchemaType[];
  kind: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => {
      if (!normalized) return true;
      return (
        option.id.toLowerCase().includes(normalized) ||
        option.description?.toLowerCase().includes(normalized)
      );
    });
  }, [options, query]);

  return (
    <details className="type-combobox">
      <summary className="type-combobox-trigger">
        <span className="type-combobox-value">{value ?? `Select ${kind} type`}</span>
        <ChevronDown size={14} />
      </summary>
      <div className="type-combobox-popover">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${kind} types`} />
        <div className="type-combobox-list">
          {filtered.slice(0, 24).map((option) => (
            <button
              key={option.id}
              type="button"
              className={`type-option ${value === option.id ? "active" : ""}`}
              onClick={() => onChange(option.id)}
            >
              <div className="type-option-head">
                <strong>{option.id}</strong>
                <small>{kind}</small>
              </div>
              <p>{option.description ?? "No description available in the loaded schema."}</p>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
