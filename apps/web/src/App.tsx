import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { editor as MonacoEditorApi } from "monaco-editor";
import MonacoEditor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileJson,
  FolderOpen,
  Hammer,
  Search,
  Server,
  Sparkles
} from "lucide-react";
import { apiBase, wsBase } from "./config";

type TreeNode = {
  name: string;
  path: string;
  relativePath: string;
  type: "directory" | "file";
  kind?: string;
  children?: TreeNode[];
};

type FileContentResponse = {
  path: string;
  filePath: string;
  raw: string;
  data?: unknown;
  errors: string[];
  kind: string;
};

type Diagnostic = {
  id: string;
  severity: "error" | "warning" | "info";
  filePath: string;
  message: string;
  suggestion?: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  quickFix?: {
    label: string;
    replacement?: string;
  };
};

type SchemaField = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  allowedValues?: string[];
  nestedKind?: string;
  arrayItemType?: string;
};

type SchemaType = {
  id: string;
  kind: string;
  description?: string;
  fields: SchemaField[];
  source: string;
};

type FileReference = {
  kind: "origin" | "origin_layer" | "power" | "item_modifier" | "tag" | "resource" | "function" | "damage_type";
  id: string;
  sourcePath: string;
  jsonPath?: string;
};

type ReferenceItem = {
  id: string;
  kind: "power" | "tag" | "item_modifier" | "resource";
  status: "found" | "missing";
  path?: string;
};

type DefinitionItem = {
  id: string;
  kind: string;
  path?: string;
};

type LookupEntry = {
  id: string;
  kind: string;
  path: string;
  relativePath: string;
};

const recentProjectsKey = "origin-studio:recent-projects";
const sectionOrder = [
  "origin",
  "origin_layer",
  "power",
  "item_modifier",
  "tag",
  "damage_type",
  "function",
  "unknown"
] as const;

const explainMap: Record<string, string> = {
  "action-on-hit-invalid-chance":
    "Move chance into bientity_condition and use origins:chance in the appropriate context.",
  "action-on-hit-invalid-condition":
    "Top-level condition is not part of origins:action_on_hit. Use the contextual condition field instead.",
  "invalid-inverted-type":
    "origins:inverted is not a standalone type. Keep the original condition type and add inverted: true."
};

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const selectedPathRef = useRef<string | undefined>(undefined);
  const projectRootRef = useRef<string | undefined>(undefined);
  const [serverStatus, setServerStatus] = useState<string>("checking");
  const [projectRoot, setProjectRoot] = useState<string>();
  const [projectInput, setProjectInput] = useState("");
  const [recentProjects, setRecentProjects] = useState<string[]>(loadRecentProjects());
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [projectError, setProjectError] = useState<string>();
  const [fileContent, setFileContent] = useState<FileContentResponse>();
  const [draftContent, setDraftContent] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [schema, setSchema] = useState<SchemaType | null>(null);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");
  const [problemFilter, setProblemFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [activeTab, setActiveTab] = useState("json");
  const [incomingReferences, setIncomingReferences] = useState<FileReference[]>([]);

  const selectedDiagnostics = useMemo(
    () => diagnostics.filter((diagnostic) => !selectedPath || diagnostic.filePath === selectedPath),
    [diagnostics, selectedPath]
  );

  const currentFileProblems = useMemo(
    () => collapseDiagnostics(selectedDiagnostics).filter(bySeverity(problemFilter)),
    [selectedDiagnostics, problemFilter]
  );

  const projectProblems = useMemo(
    () =>
      collapseDiagnostics(diagnostics.filter((diagnostic) => !selectedPath || diagnostic.filePath !== selectedPath)).filter(
        bySeverity(problemFilter)
      ),
    [diagnostics, selectedPath, problemFilter]
  );

  const groupedFiles = useMemo(() => groupNodes(flattenFiles(tree), filter), [tree, filter]);
  const selectedJson = useMemo(() => {
    try {
      return draftContent ? JSON.parse(draftContent) : undefined;
    } catch {
      return fileContent?.data;
    }
  }, [draftContent, fileContent?.data]);

  const fileLookup = useMemo(() => buildLookup(flattenFiles(tree)), [tree]);
  const selectedRelativePath = useMemo(
    () => (selectedPath && projectRoot ? toProjectRelative(projectRoot, selectedPath) : undefined),
    [projectRoot, selectedPath]
  );
  const selectedFileName = selectedPath ? basename(selectedPath) : undefined;
  const selectedDirectory = selectedRelativePath ? dirnameLabel(selectedRelativePath) : undefined;
  const selectedFileId = useMemo(
    () => (selectedRelativePath && fileContent ? deriveIdFromRelativePath(selectedRelativePath, fileContent.kind) : undefined),
    [selectedRelativePath, fileContent]
  );

  const referenceGroups = useMemo(() => {
    const groups = collectReferenceGroups(selectedJson);

    return {
      powers: groups.power.map((id) => buildReferenceItem("power", id, fileLookup, currentFileProblems)),
      tags: groups.tag.map((id) => buildReferenceItem("tag", id, fileLookup, currentFileProblems)),
      itemModifiers: groups.item_modifier.map((id) => buildReferenceItem("item_modifier", id, fileLookup, currentFileProblems)),
      resources: groups.resource.map((id) => buildReferenceItem("resource", id, fileLookup, currentFileProblems))
    };
  }, [selectedJson, fileLookup, currentFileProblems]);

  const definitionsCreated = useMemo(
    () => buildDefinitionsCreated(selectedJson, selectedRelativePath, fileContent?.kind, selectedPath),
    [selectedJson, selectedRelativePath, fileContent?.kind, selectedPath]
  );

  const loadProjectState = useCallback(async () => {
    const [projectResponse, treeResponse, problemsResponse] = await Promise.all([
      fetchJson<{ projectRoot?: string }>("/api/project"),
      fetchJson<TreeNode[]>("/api/files/tree").catch(() => []),
      fetchJson<Diagnostic[]>("/api/problems").catch(() => [])
    ]);

    setProjectRoot(projectResponse.projectRoot);
    setProjectInput(projectResponse.projectRoot ?? "");
    setTree(treeResponse);
    setDiagnostics(problemsResponse);
  }, []);

  const loadFile = useCallback(async (filePath: string) => {
    const result = await fetchJson<FileContentResponse>(
      `/api/files/content?path=${encodeURIComponent(filePath)}`
    );
    setSelectedPath(filePath);
    setFileContent(result);
    setDraftContent(result.raw);
    setDirty(false);
    setActiveTab("json");

    const schemaKind = inferSchemaKindForFile(result.kind);
    const type = isObject(result.data) && typeof result.data.type === "string" ? result.data.type : undefined;
    if (type && schemaKind) {
      const schemaResult = await fetchJson<SchemaType | null>(
        `/api/schemas/type?kind=${encodeURIComponent(schemaKind)}&type=${encodeURIComponent(type)}`
      );
      setSchema(schemaResult);
    } else {
      setSchema(null);
    }
  }, []);

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    projectRootRef.current = projectRoot;
  }, [projectRoot]);

  useEffect(() => {
    void fetchJson<{ ok: boolean }>("/api/health")
      .then((result) => setServerStatus(result.ok ? "online" : "offline"))
      .catch(() => setServerStatus("offline"));
    void loadProjectState();
  }, [loadProjectState]);

  useEffect(() => {
    if (socketRef.current) return;

    const socket = new WebSocket(`${wsBase}/api/live`);
    socketRef.current = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { event: string; payload: unknown };
      if (message.event === "diagnosticsUpdated") {
        setDiagnostics(message.payload as Diagnostic[]);
      }
      if (message.event === "projectOpened" || message.event === "indexUpdated") {
        void loadProjectState();
      }
      if (message.event === "fileChanged") {
        const payload = message.payload as { filePath?: string };
        const selected = selectedPathRef.current;
        const root = projectRootRef.current;
        if (payload.filePath && selected && root) {
          const changedPath = `${root}/${payload.filePath}`.replace(/\\/g, "/");
          if (changedPath === selected.replace(/\\/g, "/")) {
            void loadFile(selected);
          }
        }
      }
    };
    socket.onerror = (error) => {
      console.warn("[origin-studio] websocket error", error);
    };

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [loadProjectState, loadFile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && selectedPath) {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    async function loadIncomingReferences() {
      if (!selectedFileId || !fileContent) {
        setIncomingReferences([]);
        return;
      }

      if (fileContent.kind === "power") {
        setIncomingReferences(
          await fetchJson<FileReference[]>(`/api/references/power?id=${encodeURIComponent(selectedFileId)}`).catch(() => [])
        );
        return;
      }

      if (fileContent.kind === "item_modifier") {
        setIncomingReferences(
          await fetchJson<FileReference[]>(`/api/references/item_modifier?id=${encodeURIComponent(selectedFileId)}`).catch(
            () => []
          )
        );
        return;
      }

      if (fileContent.kind === "tag") {
        setIncomingReferences(
          await fetchJson<FileReference[]>(`/api/references/tag?id=${encodeURIComponent(selectedFileId)}`).catch(() => [])
        );
        return;
      }

      setIncomingReferences([]);
    }

    void loadIncomingReferences();
  }, [selectedFileId, fileContent]);

  async function openProject(nextPath?: string) {
    const target = (nextPath ?? projectInput).trim();

    if (!target) {
      setProjectError("Enter the datapack folder path.");
      return;
    }

    try {
      setProjectError(undefined);
      const result = await fetchJson<{ projectRoot: string }>("/api/project/open", {
        method: "POST",
        body: JSON.stringify({ path: target })
      });
      setProjectRoot(result.projectRoot);
      setProjectInput(result.projectRoot);
      rememberProject(result.projectRoot, setRecentProjects);
      await loadProjectState();
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Could not open this project.");
    }
  }

  async function saveFile() {
    if (!selectedPath) return;
    await fetchJson("/api/files/content", {
      method: "PUT",
      body: JSON.stringify({ path: selectedPath, content: draftContent })
    });
    await loadFile(selectedPath);
  }

  async function applyQuickFix(replacement: string) {
    if (!selectedPath) return;
    const next = draftContent.replace(/"type"\s*:\s*"origins:inverted"/, replacement);
    setDraftContent(formatJsonDocument(next));
    setDirty(true);
    setActiveTab("json");
  }

  function handleVisualValueChange(pathSegments: Array<string | number>, value: unknown) {
    if (!selectedJson || (!isObject(selectedJson) && !Array.isArray(selectedJson))) return;
    const next = structuredClone(selectedJson);
    setValueAtPath(next, pathSegments, value);
    setDraftContent(formatJsonDocument(JSON.stringify(next, null, 2)));
    setDirty(true);
  }

  function goToProblem(diagnostic: Diagnostic) {
    if (!diagnostic.range || !editorRef.current) {
      setActiveTab("json");
      return;
    }

    const range = diagnostic.range;
    setActiveTab("json");
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(range.startLine);
      editor.setSelection({
        startLineNumber: range.startLine,
        startColumn: range.startColumn,
        endLineNumber: range.endLine,
        endColumn: range.endColumn
      });
      editor.focus();
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <h1>Origin Studio</h1>
            <p>Local-first editor for Origins and Apoli datapacks.</p>
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
              onChange={(event) => {
                setProjectInput(event.target.value);
                setProjectError(undefined);
              }}
              placeholder="C:/Users/User/Desktop/MyOriginsDatapack"
            />
            {projectError ? <p className="error-text">{projectError}</p> : null}
            <button className="primary-button" disabled={!projectInput.trim()} onClick={() => void openProject()}>
              <FolderOpen size={16} />
              Open Project
            </button>
            <div className="recent-list">
              <h3>Recent projects</h3>
              {recentProjects.map((project) => (
                <button key={project} className="recent-item" onClick={() => void openProject(project)} title={project}>
                  {project}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="project-panel">
              <div className="section-head">
                <h2>Explorer</h2>
                {projectRoot ? (
                  <button className="ghost-button" onClick={() => void openProject(projectRoot)}>
                    Reopen
                  </button>
                ) : null}
              </div>
              <label className="search-box">
                <Search size={14} />
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search files" />
              </label>
              <div className="explorer-list">
                {sectionOrder.map((kind) => (
                  <div key={kind} className="explorer-group">
                    <h3>{labelForKind(kind)}</h3>
                    {(groupedFiles[kind] ?? []).map((node) => (
                      <button
                        key={node.path}
                        className={`file-row ${selectedPath === node.path ? "active" : ""}`}
                        onClick={() => void loadFile(node.path)}
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
            </section>

            <section className="footer-project">
              <small>Open project</small>
              <strong title={projectRoot}>{projectRoot}</strong>
            </section>
          </>
        )}
      </aside>

      <main className="workspace">
        {!projectRoot ? (
          <section className="hero-panel">
            <div className="hero-copy">
              <h2>Open any datapack and edit the real files without export or import.</h2>
              <p>
                The MVP follows external file changes, validates known Origins and Apoli patterns,
                and preserves unknown fields while you edit.
              </p>
            </div>
            <div className="hero-grid">
              <div className="hero-card">
                <Hammer size={18} />
                <h3>Visual and JSON</h3>
                <p>Use structured cards for common fields and Monaco for direct JSON editing.</p>
              </div>
              <div className="hero-card">
                <AlertCircle size={18} />
                <h3>Helpful diagnostics</h3>
                <p>Validation stays informative and non-blocking while you build incomplete files.</p>
              </div>
            </div>
          </section>
        ) : !selectedPath ? (
          <section className="empty-editor">
            <h2>Select a file in the explorer</h2>
            <p>Open a power, origin, tag, or related file to edit, inspect, and validate it.</p>
          </section>
        ) : (
          <>
            <header className="editor-header">
              <div className="editor-header-copy" title={selectedPath}>
                <small>{labelForKind(fileContent?.kind)}</small>
                <h2>{selectedFileName}</h2>
                <p>{selectedDirectory}</p>
              </div>
              <div className="editor-actions">
                <span className={`status-pill ${dirty ? "dirty" : "saved"}`}>
                  {dirty ? "Modified" : "Saved"}
                </span>
                <button className="ghost-button" onClick={() => selectedPath && void loadFile(selectedPath)}>
                  Reload
                </button>
                <button className="primary-button" onClick={() => void saveFile()}>
                  Save
                </button>
              </div>
            </header>

            <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="tabs-root">
              <Tabs.List className="tabs-list">
                <Tabs.Trigger value="visual">Visual</Tabs.Trigger>
                <Tabs.Trigger value="json">JSON</Tabs.Trigger>
                <Tabs.Trigger value="problems">Problems</Tabs.Trigger>
                <Tabs.Trigger value="references">References</Tabs.Trigger>
                <Tabs.Trigger value="schema">Raw Schema</Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="visual" className="tab-panel">
                <VisualEditor
                  json={selectedJson}
                  schema={schema}
                  fileKind={fileContent?.kind}
                  onValueChange={handleVisualValueChange}
                />
              </Tabs.Content>

              <Tabs.Content value="json" className="tab-panel">
                <MonacoEditor
                  height="100%"
                  defaultLanguage={fileContent?.kind === "function" ? "plaintext" : "json"}
                  value={draftContent}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                  onChange={(value: string | undefined) => {
                    setDraftContent(value ?? "");
                    setDirty(true);
                  }}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    automaticLayout: true
                  }}
                />
              </Tabs.Content>

              <Tabs.Content value="problems" className="tab-panel">
                <ProblemsPanel
                  currentFileProblems={currentFileProblems}
                  projectProblems={projectProblems}
                  onExplain={(id) => window.alert(explainMap[id] ?? "No extended explanation is registered in the MVP yet.")}
                  onApplyQuickFix={(replacement) => void applyQuickFix(replacement)}
                  onGoToProblem={goToProblem}
                />
              </Tabs.Content>

              <Tabs.Content value="references" className="tab-panel">
                <ReferenceInspector
                  referenceGroups={referenceGroups}
                  definitionsCreated={definitionsCreated}
                  incomingReferences={incomingReferences}
                  onOpenFile={(path) => void loadFile(path)}
                />
              </Tabs.Content>

              <Tabs.Content value="schema" className="tab-panel">
                <pre className="schema-panel">{JSON.stringify(schema, null, 2)}</pre>
              </Tabs.Content>
            </Tabs.Root>
          </>
        )}
      </main>
    </div>
  );
}

function VisualEditor({
  json,
  schema,
  fileKind,
  onValueChange
}: {
  json: unknown;
  schema: SchemaType | null;
  fileKind?: string | undefined;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
}) {
  if (!isObject(json)) {
    return <div className="placeholder-panel">Visual editing is not available for this file.</div>;
  }

  const identityKeys = new Set(["type", "name", "description"]);
  const schemaFields = (schema?.fields ?? []).filter((field) => !identityKeys.has(field.name));
  const knownFields = new Set(["type", "name", "description", ...schemaFields.map((field) => field.name)]);
  const customFields = Object.keys(json).filter((key) => !knownFields.has(key));

  return (
    <div className="visual-layout">
      <SchemaSection title="Identity" description="Core metadata for this file.">
        <FieldEditor
          path={["type"]}
          label="Type"
          value={json.type}
          field={{ name: "type", type: "string", required: true }}
          onValueChange={onValueChange}
        />
        <FieldEditor
          path={["name"]}
          label="Name"
          value={json.name}
          field={{ name: "name", type: "string", required: false }}
          onValueChange={onValueChange}
        />
        <FieldEditor
          path={["description"]}
          label="Description"
          value={json.description}
          field={{ name: "description", type: "string", required: false }}
          onValueChange={onValueChange}
        />
      </SchemaSection>

      <SchemaSection
        title={`${labelForKind(fileKind)} Configuration`}
        description="Recognized fields from the current schema."
      >
        {schemaFields.length === 0 ? <EmptyState text="No typed configuration fields are available for this file yet." /> : null}
        {schemaFields.map((field) => (
          <FieldEditor
            key={field.name}
            path={[field.name]}
            label={startCase(field.name)}
            value={json[field.name]}
            field={field}
            onValueChange={onValueChange}
          />
        ))}
      </SchemaSection>

      <SchemaSection
        title="Custom / Unknown Fields"
        description="Fields not recognized by the active schema are preserved as-is."
      >
        {customFields.length === 0 ? <EmptyState text="No custom fields detected." /> : null}
        {customFields.map((fieldName) => (
          <FieldEditor
            key={fieldName}
            path={[fieldName]}
            label={fieldName}
            value={json[fieldName]}
            field={{ name: fieldName, type: inferFieldType(json[fieldName]), required: false }}
            onValueChange={onValueChange}
          />
        ))}
      </SchemaSection>
    </div>
  );
}

function ProblemsPanel({
  currentFileProblems,
  projectProblems,
  onExplain,
  onApplyQuickFix,
  onGoToProblem
}: {
  currentFileProblems: Diagnostic[];
  projectProblems: Diagnostic[];
  onExplain: (id: string) => void;
  onApplyQuickFix: (replacement: string) => void;
  onGoToProblem: (diagnostic: Diagnostic) => void;
}) {
  return (
    <div className="problems-layout">
      <div className="problem-toolbar">
        <h3>Current file problems</h3>
        <p>Focused diagnostics for the file open in the editor.</p>
      </div>
      <div className="problem-list">
        {currentFileProblems.length === 0 ? <EmptyState text="No problems in this file." /> : null}
        {currentFileProblems.map((problem) => (
          <ProblemCard
            key={problemKey(problem)}
            diagnostic={problem}
            onExplain={onExplain}
            onApplyQuickFix={onApplyQuickFix}
            onGoToProblem={onGoToProblem}
          />
        ))}
      </div>

      <div className="problem-toolbar problem-toolbar-secondary">
        <h3>Project problems</h3>
        <p>Diagnostics from the rest of the open datapack.</p>
      </div>
      <div className="problem-list">
        {projectProblems.length === 0 ? <EmptyState text="No additional project problems." /> : null}
        {projectProblems.map((problem) => (
          <ProblemCard
            key={problemKey(problem)}
            diagnostic={problem}
            onExplain={onExplain}
            onApplyQuickFix={onApplyQuickFix}
            onGoToProblem={onGoToProblem}
          />
        ))}
      </div>
    </div>
  );
}

function ProblemCard({
  diagnostic,
  onExplain,
  onApplyQuickFix,
  onGoToProblem
}: {
  diagnostic: Diagnostic;
  onExplain: (id: string) => void;
  onApplyQuickFix: (replacement: string) => void;
  onGoToProblem: (diagnostic: Diagnostic) => void;
}) {
  return (
    <article className={`problem-card ${diagnostic.severity}`}>
      <div className="problem-copy">
        <div className="problem-meta">
          <span className={`severity-badge ${diagnostic.severity}`}>{diagnostic.severity}</span>
          <strong>{diagnostic.id}</strong>
          {diagnostic.range ? (
            <span className="problem-location">
              L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}
            </span>
          ) : null}
        </div>
        <p>{diagnostic.message}</p>
        {diagnostic.suggestion ? <small>{diagnostic.suggestion}</small> : null}
        <code className="problem-file">{diagnostic.filePath}</code>
      </div>
      <div className="problem-actions">
        {diagnostic.range ? (
          <button className="ghost-button" onClick={() => onGoToProblem(diagnostic)}>
            Go to field
          </button>
        ) : null}
        <button className="ghost-button" onClick={() => onExplain(diagnostic.id)}>
          Explain
        </button>
        <button className="ghost-button" onClick={() => void copyToClipboard(JSON.stringify(diagnostic, null, 2))}>
          <Copy size={14} />
          Copy
        </button>
        {diagnostic.quickFix?.replacement ? (
          <button className="ghost-button" onClick={() => onApplyQuickFix(diagnostic.quickFix!.replacement!)}>
            {diagnostic.quickFix.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ReferenceInspector({
  referenceGroups,
  definitionsCreated,
  incomingReferences,
  onOpenFile
}: {
  referenceGroups: {
    powers: ReferenceItem[];
    tags: ReferenceItem[];
    itemModifiers: ReferenceItem[];
    resources: ReferenceItem[];
  };
  definitionsCreated: DefinitionItem[];
  incomingReferences: FileReference[];
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="reference-layout">
      <ReferenceCard
        title="Powers used by this file"
        items={referenceGroups.powers}
        emptyText="No power references detected."
        onOpenFile={onOpenFile}
      />
      <ReferenceCard
        title="Tags used by this file"
        items={referenceGroups.tags}
        emptyText="No tag references detected."
        onOpenFile={onOpenFile}
      />
      <ReferenceCard
        title="Item modifiers used by this file"
        items={referenceGroups.itemModifiers}
        emptyText="No item modifier references detected."
        onOpenFile={onOpenFile}
      />
      <ReferenceCard
        title="Resources used by this file"
        items={referenceGroups.resources}
        emptyText="No resource references detected."
        onOpenFile={onOpenFile}
      />
      <DefinitionCard title="Definitions created by this file" items={definitionsCreated} />
      <IncomingReferencesCard items={incomingReferences} onOpenFile={onOpenFile} />
    </div>
  );
}

function SchemaSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="visual-card">
      <div className="section-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="field-stack">{children}</div>
    </section>
  );
}

function FieldEditor({
  path,
  label,
  value,
  field,
  onValueChange
}: {
  path: Array<string | number>;
  label: string;
  value: unknown;
  field: SchemaField;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
}) {
  if (Array.isArray(value)) {
    return <ArrayFieldEditor path={path} label={label} items={value} field={field} onValueChange={onValueChange} />;
  }

  if (isObject(value)) {
    return <ObjectFieldEditor path={path} label={label} value={value} field={field} onValueChange={onValueChange} />;
  }

  const isLongText = typeof value === "string" && value.length > 80;
  const allowedValues = field.allowedValues?.filter((item) => !item.startsWith("$")) ?? [];

  return (
    <label className="field-row">
      <span>
        {label}
        {field.required ? " *" : ""}
      </span>
      {field.description ? <small>{field.description}</small> : null}
      {allowedValues.length > 0 ? (
        <select value={String(value ?? "")} onChange={(event) => onValueChange(path, event.target.value)}>
          <option value="">Select a value</option>
          {allowedValues.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : typeof value === "boolean" ? (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value}
            onChange={(event) => onValueChange(path, event.target.checked)}
          />
          <span>{value ? "Enabled" : "Disabled"}</span>
        </label>
      ) : typeof value === "number" ? (
        <input type="number" value={String(value)} onChange={(event) => onValueChange(path, Number(event.target.value))} />
      ) : isLongText ? (
        <textarea value={String(value ?? "")} onChange={(event) => onValueChange(path, event.target.value)} rows={4} />
      ) : (
        <input value={String(value ?? "")} onChange={(event) => onValueChange(path, event.target.value)} />
      )}
    </label>
  );
}

function ObjectFieldEditor({
  path,
  label,
  value,
  field,
  onValueChange
}: {
  path: Array<string | number>;
  label: string;
  value: Record<string, unknown>;
  field: SchemaField;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
}) {
  const entries = Object.entries(value);
  const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2));

  useEffect(() => {
    setRaw(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <details className="node-card" open>
      <summary>
        <span className="node-card-title">
          {label}
          {typeof value.type === "string" ? <strong>{value.type}</strong> : null}
        </span>
        <span className="node-card-icon">
          <ChevronRight size={16} />
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="node-card-body">
        {field.description ? <p className="node-card-description">{field.description}</p> : null}
        {entries.length === 0 ? <EmptyState text="This object is currently empty." compact /> : null}
        {entries.map(([childKey, childValue]) => (
          <FieldEditor
            key={childKey}
            path={[...path, childKey]}
            label={startCase(childKey)}
            value={childValue}
            field={{
              name: childKey,
              type: inferFieldType(childValue),
              required: false
            }}
            onValueChange={onValueChange}
          />
        ))}
        <label className="field-row field-row-raw">
          <span>Raw JSON</span>
          <small>Fallback editor for this nested object.</small>
          <textarea value={raw} rows={6} onChange={(event) => setRaw(event.target.value)} />
          <button
            className="ghost-button"
            onClick={() => {
              try {
                onValueChange(path, JSON.parse(raw));
              } catch {
                // keep invalid draft local until the user fixes it
              }
            }}
          >
            Apply JSON
          </button>
        </label>
      </div>
    </details>
  );
}

function ArrayFieldEditor({
  path,
  label,
  items,
  field,
  onValueChange
}: {
  path: Array<string | number>;
  label: string;
  items: unknown[];
  field: SchemaField;
  onValueChange: (path: Array<string | number>, value: unknown) => void;
}) {
  return (
    <details className="node-card" open>
      <summary>
        <span className="node-card-title">
          {label}
          <strong>{items.length} items</strong>
        </span>
        <span className="node-card-icon">
          <ChevronRight size={16} />
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="node-card-body">
        {field.description ? <p className="node-card-description">{field.description}</p> : null}
        {items.length === 0 ? <EmptyState text="This list is currently empty." compact /> : null}
        <div className="array-stack">
          {items.map((item, index) => (
            <div key={`${label}-${index}`} className="array-item">
              <FieldEditor
                path={[...path, index]}
                label={`${label} ${index + 1}`}
                value={item}
                field={{
                  name: `${field.name}[${index}]`,
                  type: field.arrayItemType ?? inferFieldType(item),
                  required: false
                }}
                onValueChange={onValueChange}
              />
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function ReferenceCard({
  title,
  items,
  emptyText,
  onOpenFile
}: {
  title: string;
  items: ReferenceItem[];
  emptyText: string;
  onOpenFile: (path: string) => void;
}) {
  return (
    <section className="visual-card">
      <h3>{title}</h3>
      {items.length === 0 ? <EmptyState text={emptyText} compact /> : null}
      <div className="reference-stack">
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="reference-item">
            <div>
              <strong>{item.id}</strong>
              <small>{item.kind}</small>
              {item.path ? <code>{item.path}</code> : null}
            </div>
            <div className="reference-actions">
              <span className={`status-tag ${item.status}`}>{item.status}</span>
              <button className="ghost-button" onClick={() => void copyToClipboard(item.id)}>
                <Copy size={14} />
                Copy ID
              </button>
              {item.path ? (
                <button className="ghost-button" onClick={() => onOpenFile(item.path!)}>
                  <ExternalLink size={14} />
                  Open
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DefinitionCard({ title, items }: { title: string; items: DefinitionItem[] }) {
  return (
    <section className="visual-card">
      <h3>{title}</h3>
      {items.length === 0 ? <EmptyState text="This file does not declare known IDs." compact /> : null}
      <div className="reference-stack">
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="reference-item">
            <div>
              <strong>{item.id}</strong>
              <small>{item.kind}</small>
              {item.path ? <code>{item.path}</code> : null}
            </div>
            <div className="reference-actions">
              <button className="ghost-button" onClick={() => void copyToClipboard(item.id)}>
                <Copy size={14} />
                Copy ID
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IncomingReferencesCard({
  items,
  onOpenFile
}: {
  items: FileReference[];
  onOpenFile: (path: string) => void;
}) {
  return (
    <section className="visual-card">
      <h3>Files referencing this file</h3>
      {items.length === 0 ? <EmptyState text="No incoming references found." compact /> : null}
      <div className="reference-stack">
        {items.map((item, index) => (
          <div key={`${item.sourcePath}-${index}`} className="reference-item">
            <div>
              <strong>{item.id}</strong>
              <small>{item.kind}</small>
              <code>{item.sourcePath}</code>
            </div>
            <div className="reference-actions">
              <button className="ghost-button" onClick={() => void copyToClipboard(item.id)}>
                <Copy size={14} />
                Copy ID
              </button>
              <button className="ghost-button" onClick={() => onOpenFile(item.sourcePath)}>
                <ExternalLink size={14} />
                Open
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ text, compact }: { text: string; compact?: boolean }) {
  return <p className={compact ? "empty-state compact" : "empty-state"}>{text}</p>;
}

function loadRecentProjects(): string[] {
  try {
    const raw = window.localStorage.getItem(recentProjectsKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberProject(project: string, setRecentProjects: (items: string[]) => void) {
  const next = [project, ...loadRecentProjects().filter((item) => item !== project)].slice(0, 5);
  window.localStorage.setItem(recentProjectsKey, JSON.stringify(next));
  setRecentProjects(next);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw) as { message?: string };
      message = parsed.message ?? raw;
    } catch {
      message = raw;
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => (node.type === "file" ? [node] : flattenFiles(node.children ?? [])));
}

function groupNodes(nodes: TreeNode[], filter: string): Record<string, TreeNode[]> {
  const filtered = nodes.filter((node) => !filter || node.relativePath.toLowerCase().includes(filter.toLowerCase()));

  return filtered.reduce<Record<string, TreeNode[]>>((accumulator, node) => {
    const kind = node.kind ?? "unknown";
    accumulator[kind] ??= [];
    accumulator[kind].push(node);
    return accumulator;
  }, {});
}

function labelForKind(kind?: string): string {
  switch (kind) {
    case "origin":
      return "Origins";
    case "origin_layer":
      return "Origin Layers";
    case "power":
      return "Powers";
    case "item_modifier":
      return "Item Modifiers";
    case "tag":
      return "Tags";
    case "damage_type":
      return "Damage Types";
    case "function":
      return "Functions";
    case "resource":
      return "Resources";
    default:
      return "Files";
  }
}

function inferSchemaKindForFile(kind?: string): string | undefined {
  switch (kind) {
    case "power":
      return "power";
    case "origin":
      return "origin";
    case "origin_layer":
      return "origin_layer";
    case "item_modifier":
      return "item_modifier";
    case "tag":
      return "tag";
    case "damage_type":
      return "damage_type";
    default:
      return undefined;
  }
}

function formatJsonDocument(content: string): string {
  try {
    return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
  } catch {
    return content;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

function dirnameLabel(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
}

function toProjectRelative(projectRoot: string, filePath: string): string {
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.startsWith(normalizedRoot) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}

function bySeverity(filter: "all" | "error" | "warning" | "info") {
  return (diagnostic: Diagnostic) => filter === "all" || diagnostic.severity === filter;
}

function problemKey(problem: Diagnostic): string {
  return [problem.id, problem.filePath, problem.message, problem.range?.startLine, problem.range?.startColumn].join(":");
}

function collapseDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...new Map(diagnostics.map((diagnostic) => [problemKey(diagnostic), diagnostic])).values()];
}

function setValueAtPath(target: unknown, path: Array<string | number>, value: unknown): void {
  if (path.length === 0) return;

  let current = target as Record<string | number, unknown>;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]!;
    const next = current[segment];
    if (isObject(next) || Array.isArray(next)) {
      current = next as Record<string | number, unknown>;
      continue;
    }

    const nextSegment = path[index + 1]!;
    const replacement = (typeof nextSegment === "number" ? [] : {}) as unknown as Record<string | number, unknown>;
    current[segment] = replacement;
    current = replacement;
  }

  const lastSegment = path[path.length - 1]!;
  current[lastSegment] = value;
}

function inferFieldType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (isObject(value)) return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function buildLookup(files: TreeNode[]): Record<string, LookupEntry> {
  const lookup: Record<string, LookupEntry> = {};

  for (const file of files) {
    if (!file.kind || file.kind === "unknown") continue;
    const id = deriveIdFromRelativePath(file.relativePath, file.kind);
    if (!id) continue;
    lookup[id] = {
      id,
      kind: file.kind,
      path: file.path,
      relativePath: file.relativePath
    };
  }

  return lookup;
}

function deriveIdFromRelativePath(relativePath: string, kind?: string): string | undefined {
  const normalized = relativePath.replace(/\\/g, "/");
  const jsonMatch = normalized.match(/^data\/([^/]+)\/([^/]+)\/(.+)\.json$/i);
  const functionMatch = normalized.match(/^data\/([^/]+)\/functions\/(.+)\.mcfunction$/i);

  if (kind === "function" && functionMatch) {
    return `${functionMatch[1]}:${functionMatch[2]}`;
  }

  if (!jsonMatch) return undefined;
  const [, namespace, folder, localPath] = jsonMatch;
  if (!namespace || !localPath) return undefined;

  switch (kind) {
    case "power":
    case "origin":
    case "item_modifier":
    case "damage_type":
      return `${namespace}:${localPath}`;
    case "origin_layer":
      return `${namespace}:${localPath}`;
    case "tag":
      return `#${namespace}:${localPath.replace(/^tags\//, "")}`;
    default:
      return undefined;
  }
}

function collectReferenceGroups(json: unknown): Record<"power" | "tag" | "item_modifier" | "resource", string[]> {
  const groups: Record<"power" | "tag" | "item_modifier" | "resource", Set<string>> = {
    power: new Set<string>(),
    tag: new Set<string>(),
    item_modifier: new Set<string>(),
    resource: new Set<string>()
  };

  function walk(value: unknown, key?: string) {
    if (Array.isArray(value)) {
      if (key === "powers") {
        for (const item of value) {
          if (typeof item === "string") groups.power.add(item);
        }
      }

      value.forEach((item) => walk(item));
      return;
    }

    if (!isObject(value)) return;

    for (const [childKey, child] of Object.entries(value)) {
      if (typeof child === "string") {
        if (childKey === "power") groups.power.add(child);
        if (childKey === "tag") groups.tag.add(child);
        if (childKey === "item_modifier" || childKey === "modifier") groups.item_modifier.add(child);
        if (childKey === "resource") groups.resource.add(child);
      }

      walk(child, childKey);
    }
  }

  walk(json);
  return {
    power: [...groups.power],
    tag: [...groups.tag],
    item_modifier: [...groups.item_modifier],
    resource: [...groups.resource]
  };
}

function buildReferenceItem(
  kind: "power" | "tag" | "item_modifier" | "resource",
  id: string,
  lookup: Record<string, LookupEntry>,
  diagnostics: Diagnostic[]
): ReferenceItem {
  const missing = diagnostics.some((diagnostic) => diagnostic.message.includes(`"${id}"`) && diagnostic.id.includes("missing"));
  const resolved = lookup[id];

  return {
    id,
    kind,
    status: missing ? "missing" : "found",
    ...(resolved?.path ? { path: resolved.path } : {})
  };
}

function buildDefinitionsCreated(
  json: unknown,
  relativePath?: string,
  kind?: string,
  absolutePath?: string
): DefinitionItem[] {
  if (!relativePath || !kind) return [];

  const definitions: DefinitionItem[] = [];
  const ownId = deriveIdFromRelativePath(relativePath, kind);
  if (ownId) {
    definitions.push(makeDefinition(ownId, kind, absolutePath));
  }

  if (kind === "power" && isObject(json)) {
    if (json.type === "origins:multiple" && ownId) {
      for (const [key, child] of Object.entries(json)) {
        if (["type", "name", "description", "condition", "loading_priority", "hidden", "badges"].includes(key)) {
          continue;
        }

        if (!isObject(child)) continue;
        definitions.push(makeDefinition(`${ownId}_${key}`, "subpower", absolutePath));
        if (child.type === "origins:resource") {
          definitions.push(makeDefinition(`${ownId}_${key}`, "resource", absolutePath));
        }
      }
    }

    if (json.type === "origins:resource" && ownId) {
      definitions.push(makeDefinition(ownId, "resource", absolutePath));
    }
  }

  return collapseDefinitions(definitions);
}

function collapseDefinitions(definitions: DefinitionItem[]): DefinitionItem[] {
  return [...new Map(definitions.map((definition) => [`${definition.kind}:${definition.id}`, definition])).values()];
}

function makeDefinition(id: string, kind: string, path?: string): DefinitionItem {
  return {
    id,
    kind,
    ...(path ? { path } : {})
  };
}

function startCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore clipboard failures in MVP
  }
}
