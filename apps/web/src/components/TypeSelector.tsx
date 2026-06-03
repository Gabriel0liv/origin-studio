import { useMemo, useState } from "react";
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
    <div className="type-selector">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${kind} types`}
      />
      <div className="type-option-list">
        {filtered.slice(0, 24).map((option) => (
          <button
            key={option.id}
            type="button"
            className={`type-option ${value === option.id ? "active" : ""}`}
            onClick={() => onChange(option.id)}
          >
            <div>
              <strong>{option.id}</strong>
              <small>{kind}</small>
            </div>
            <p>{option.description ?? "No description available in the loaded schema."}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
