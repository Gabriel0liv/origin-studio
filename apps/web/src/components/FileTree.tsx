import { ChevronDown, ChevronRight, FileJson, Folder } from "lucide-react";
import type { TreeNode } from "../types";
import { basename, labelForKind, sectionOrder } from "../utils";

type ExplorerNode = {
  name: string;
  path: string | undefined;
  relativePath: string | undefined;
  kind: string | undefined;
  children: Record<string, ExplorerNode>;
};

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
    <div className="file-tree explorer-list">
      {sectionOrder.map((kind) => {
        const nodes = groupedFiles[kind] ?? [];
        const tree = buildExplorerTree(nodes);

        return (
          <div key={kind} className="explorer-group">
            <h3>{labelForKind(kind)}</h3>
            {Object.values(tree.children).map((node) => (
              <ExplorerBranch key={`${kind}-${node.name}`} node={node} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ExplorerBranch({
  node,
  selectedPath,
  onSelect,
  depth = 0
}: {
  node: ExplorerNode;
  selectedPath?: string | undefined;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  const hasChildren = Object.keys(node.children).length > 0;

  if (node.path) {
    return (
      <button
        className={`tree-row file ${selectedPath === node.path ? "active" : ""}`}
        onClick={() => onSelect(node.path!)}
        title={node.relativePath}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        <FileJson size={12} />
        <span>{basename(node.relativePath ?? node.name)}</span>
      </button>
    );
  }

  return (
    <details className="tree-folder" open={depth < 2}>
      <summary className="tree-row folder" style={{ paddingLeft: `${12 + depth * 14}px` }}>
        <span className="tree-chevron">
          <ChevronRight size={12} />
          <ChevronDown size={12} />
        </span>
        <Folder size={12} />
        <span>{node.name}</span>
      </summary>
      {hasChildren ? (
        <div>
          {Object.values(node.children).map((child) => (
            <ExplorerBranch key={`${node.name}-${child.name}`} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

function buildExplorerTree(nodes: TreeNode[]): ExplorerNode {
  const root: ExplorerNode = { name: "root", path: undefined, relativePath: undefined, kind: undefined, children: {} };

  for (const node of nodes) {
    const parts = node.relativePath.replace(/\\/g, "/").split("/");
    let current = root;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      current.children[part] ??= { name: part, path: undefined, relativePath: undefined, kind: undefined, children: {} };
      current = current.children[part]!;

      if (index === parts.length - 1) {
        current.path = node.path;
        current.relativePath = node.relativePath;
        current.kind = node.kind;
      }
    }
  }

  return root;
}
