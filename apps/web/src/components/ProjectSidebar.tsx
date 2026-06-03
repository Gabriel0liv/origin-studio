import { FolderOpen, Plus, Search, Server, Sparkles } from "lucide-react";
import type { NewFileKind, TreeNode } from "../types";
import { FileTree } from "./FileTree";

const quickActions: Array<{ kind: NewFileKind; label: string }> = [
  { kind: "power", label: "New Power" },
  { kind: "origin", label: "New Origin" },
  { kind: "origin_layer", label: "New Origin Layer" },
  { kind: "item_modifier", label: "New Item Modifier" },
  { kind: "tag", label: "New Tag" }
];

export function ProjectSidebar({
  serverStatus,
  projectRoot,
  projectInput,
  projectError,
  recentProjects,
  groupedFiles,
  selectedPath,
  filter,
  onProjectInputChange,
  onOpenProject,
  onQuickCreate,
  onFilterChange,
  onSelectFile
}: {
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
}) {
  return (
    <aside className="sidebar">
      <div className="brand-card">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <h1>Origin Studio</h1>
          <p>Visual builder for Origins and Apoli datapacks.</p>
        </div>
      </div>

      <div className="server-card">
        <span className={`server-dot ${serverStatus}`} />
        <Server size={16} />
        <strong>{serverStatus === "online" ? "Server online" : "Server offline"}</strong>
      </div>

      {!projectRoot ? (
        <section className="start-panel">
          <h2>Open project</h2>
          <input
            value={projectInput}
            onChange={(event) => onProjectInputChange(event.target.value)}
            placeholder="C:/Users/User/Desktop/MyOriginsDatapack"
          />
          {projectError ? <p className="error-text">{projectError}</p> : null}
          <button className="primary-button" disabled={!projectInput.trim()} onClick={() => onOpenProject()}>
            <FolderOpen size={16} />
            Open Project
          </button>
          <div className="recent-list">
            <h3>Recent projects</h3>
            {recentProjects.map((project) => (
              <button key={project} className="recent-item" onClick={() => onOpenProject(project)} title={project}>
                {project}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="project-panel">
            <div className="section-head">
              <h2>Project Explorer</h2>
              <button className="ghost-button" onClick={() => onOpenProject(projectRoot)}>
                Reopen
              </button>
            </div>

            <div className="quick-actions">
              {quickActions.map((action) => (
                <button key={action.kind} className="quick-action" onClick={() => onQuickCreate(action.kind)}>
                  <Plus size={14} />
                  {action.label}
                </button>
              ))}
            </div>

            <label className="search-box">
              <Search size={14} />
              <input value={filter} onChange={(event) => onFilterChange(event.target.value)} placeholder="Search files" />
            </label>

            <FileTree groupedFiles={groupedFiles} selectedPath={selectedPath} onSelect={onSelectFile} />
          </section>

          <section className="footer-project">
            <small>Open project</small>
            <strong title={projectRoot}>{projectRoot}</strong>
          </section>
        </>
      )}
    </aside>
  );
}
