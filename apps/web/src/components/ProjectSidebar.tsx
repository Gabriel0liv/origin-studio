import type { ReactNode } from "react";
import { FilePlus, FolderOpen, FolderPlus, HelpCircle, Import, Layers3, Search, Server, Sparkles, Tag, Wrench } from "lucide-react";
import type { NewFileKind, TreeNode } from "../types";
import { FileTree } from "./FileTree";

const quickActions: Array<{ kind: NewFileKind; label: string; icon: ReactNode }> = [
  { kind: "power", label: "New Power", icon: <Sparkles size={14} /> },
  { kind: "origin", label: "New Origin", icon: <FolderOpen size={14} /> },
  { kind: "origin_layer", label: "New Origin Layer", icon: <Layers3 size={14} /> },
  { kind: "item_modifier", label: "New Item Modifier", icon: <Wrench size={14} /> },
  { kind: "tag", label: "New Tag", icon: <Tag size={14} /> },
];

export function ProjectSidebar({ serverStatus, projectRoot, projectInput, projectError, recentProjects, groupedFiles, selectedPath, filter, onProjectInputChange, onOpenProject, onImportProject, onOpenHelp, onCreateFolder, onQuickCreate, onFilterChange, onSelectFile }: { serverStatus: string; projectRoot?: string | undefined; projectInput: string; projectError?: string | undefined; recentProjects: string[]; groupedFiles: Record<string, TreeNode[]>; selectedPath?: string | undefined; filter: string; onProjectInputChange: (value: string) => void; onOpenProject: (path?: string) => void; onImportProject: () => void; onOpenHelp: () => void; onCreateFolder: () => void; onQuickCreate: (kind: NewFileKind) => void; onFilterChange: (value: string) => void; onSelectFile: (path: string) => void }) {
  const projectName = projectRoot ? projectRoot.replace(/\\/g, "/").split("/").pop() ?? projectRoot : undefined;

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
            <div className="section-head compact">
              <div className="project-summary">
                <strong title={projectRoot}>{projectName ?? "Open project"}</strong>
                <small>{serverStatus === "online" ? "Server online" : "Server offline"}</small>
              </div>
            </div>

            <div className="toolbar-actions">
              <details className="quick-action-menu">
                <summary className="ghost-button compact toolbar-button" aria-label="New file" title="New file">
                  <FilePlus size={14} />
                  <span>New File</span>
                </summary>
                <div className="quick-action-popover" role="menu" aria-label="New file types">
                  {quickActions.map((action) => (
                    <button key={action.kind} className="quick-action quick-action-popover-item" onClick={() => onQuickCreate(action.kind)}>
                      {action.icon}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </details>

              <button className="ghost-button compact toolbar-button" onClick={onCreateFolder} title="New folder">
                <FolderPlus size={14} />
                <span>New Folder</span>
              </button>

              <button className="ghost-button compact toolbar-button" onClick={onImportProject} title="Import another project">
                <Import size={14} />
                <span>Import</span>
              </button>

              <button className="ghost-button compact toolbar-button" onClick={onOpenHelp} title="Open help">
                <HelpCircle size={14} />
                <span>Help</span>
              </button>
            </div>

            <label className="search-box">
              <Search size={14} />
              <input value={filter} onChange={(event) => onFilterChange(event.target.value)} placeholder="Search files" />
            </label>

            <FileTree groupedFiles={groupedFiles} selectedPath={selectedPath} onSelect={onSelectFile} />
          </section>

          <section className="footer-project">
            <small>Project root</small>
            <strong title={projectRoot}>{projectRoot}</strong>
          </section>
        </>
      )}
    </aside>
  );
}
