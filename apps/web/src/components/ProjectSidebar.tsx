import type { ReactNode } from "react";
import { FilePlus, FolderOpen, FolderPlus, Layers3, Search, Server, Sparkles, Tag, Wrench } from "lucide-react";
import type { NewFileKind, TreeNode } from "../types";
import { FileTree } from "./FileTree";

const quickActions: Array<{ kind: NewFileKind; label: string; icon: ReactNode }> = [
  { kind: "power", label: "New Power", icon: <Sparkles size={14} /> },
  { kind: "origin", label: "New Origin", icon: <FolderOpen size={14} /> },
  { kind: "origin_layer", label: "New Origin Layer", icon: <Layers3 size={14} /> },
  { kind: "item_modifier", label: "New Item Modifier", icon: <Wrench size={14} /> },
  { kind: "tag", label: "New Tag", icon: <Tag size={14} /> },
];

export function ProjectSidebar({ serverStatus, projectRoot, projectInput, projectError, recentProjects, groupedFiles, selectedPath, filter, onProjectInputChange, onOpenProject, onCreateFolder, onQuickCreate, onFilterChange, onSelectFile }: { serverStatus: string; projectRoot?: string | undefined; projectInput: string; projectError?: string | undefined; recentProjects: string[]; groupedFiles: Record<string, TreeNode[]>; selectedPath?: string | undefined; filter: string; onProjectInputChange: (value: string) => void; onOpenProject: (path?: string) => void; onCreateFolder: () => void; onQuickCreate: (kind: NewFileKind) => void; onFilterChange: (value: string) => void; onSelectFile: (path: string) => void }) {
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
          <input value={projectInput} onChange={(event) => onProjectInputChange(event.target.value)} placeholder="C:/Users/User/Desktop/MyOriginsDatapack" />
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
              <button className="quick-action quick-action-icon" onClick={onCreateFolder} aria-label="New folder" title="New folder">
                <FolderPlus size={14} />
              </button>

              <details className="quick-action-menu">
                <summary className="quick-action quick-action-icon" aria-label="New file" title="New file">
                  <FilePlus size={14} />
                </summary>
                <div className="quick-action-popover" role="menu" aria-label="New file types">
                  {quickActions.map((action) => (
                    <button key={action.kind} className="quick-action quick-action-icon" onClick={() => onQuickCreate(action.kind)} aria-label={action.label} title={action.label}>
                      {action.icon}
                    </button>
                  ))}
                </div>
              </details>
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
