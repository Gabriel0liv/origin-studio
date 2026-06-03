import type { TreeNode } from "../types";
export declare function FileTree({ groupedFiles, selectedPath, onSelect }: {
    groupedFiles: Record<string, TreeNode[]>;
    selectedPath?: string | undefined;
    onSelect: (path: string) => void;
}): import("react").JSX.Element;
