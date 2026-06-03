import { FileJson } from "lucide-react";
import type { TreeNode } from "../types";
import { basename, dirnameLabel, labelForKind, sectionOrder } from "../utils";

export function FileTree({
  groupedFiles,
  selectedPath,
  onSelect
}: {
  groupedFiles: Record<string, TreeNode[]>;
  selectedPath?: string | undefined;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="explorer-list">
      {sectionOrder.map((kind) => (
        <div key={kind} className="explorer-group">
          <h3>{labelForKind(kind)}</h3>
          {(groupedFiles[kind] ?? []).map((node) => (
            <button
              key={node.path}
              className={`file-row ${selectedPath === node.path ? "active" : ""}`}
              onClick={() => onSelect(node.path)}
              title={node.relativePath}
            >
              <FileJson size={14} />
              <span className="file-row-content">
                <strong>{basename(node.relativePath)}</strong>
                <small>{dirnameLabel(node.relativePath)}</small>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
