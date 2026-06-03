import type { NewFileKind, TreeNode } from "../types";
export declare function ProjectSidebar({ serverStatus, projectRoot, projectInput, projectError, recentProjects, groupedFiles, selectedPath, filter, onProjectInputChange, onOpenProject, onQuickCreate, onFilterChange, onSelectFile }: {
    serverStatus: string;
    projectRoot?: string | undefined;
    projectInput: string;
    projectError?: string | undefined;
    recentProjects: string[];
    groupedFiles: Record<string, TreeNode[]>;
    selectedPath?: string | undefined;
    filter: string;
    onProjectInputChange: (value: string) => void;
    onOpenProject: (path?: string) => void;
    onQuickCreate: (kind: NewFileKind) => void;
    onFilterChange: (value: string) => void;
    onSelectFile: (path: string) => void;
}): import("react").JSX.Element;
