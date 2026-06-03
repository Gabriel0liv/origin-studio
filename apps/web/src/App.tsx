import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertCircle, FileJson, FolderOpen, Hammer, Search, Server, Sparkles } from "lucide-react";

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
  quickFix?: {
    label: string;
    replacement?: string;
  };
};

type SchemaType = {
  id: string;
  kind: string;
  description?: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  source: string;
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
    "Mova a chance para `bientity_condition` e use `origins:chance` no contexto correto.",
  "action-on-hit-invalid-condition":
    "O campo `condition` no topo nao faz parte de `origins:action_on_hit`; use a condicao contextual adequada.",
  "invalid-inverted-type":
    "`origins:inverted` nao existe como type isolado. A forma correta e manter o type original e adicionar `inverted: true`."
};

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const selectedPathRef = useRef<string | undefined>(undefined);
  const projectRootRef = useRef<string | undefined>(undefined);
  const [serverStatus, setServerStatus] = useState<string>("checking");
  const [projectRoot, setProjectRoot] = useState<string>();
  const [projectInput, setProjectInput] = useState("");
  const [recentProjects, setRecentProjects] = useState<string[]>(loadRecentProjects());
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [fileContent, setFileContent] = useState<FileContentResponse>();
  const [draftContent, setDraftContent] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [schema, setSchema] = useState<SchemaType | null>(null);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");
  const [problemFilter, setProblemFilter] = useState<"all" | "error" | "warning" | "info">("all");

  const selectedDiagnostics = useMemo(
    () => diagnostics.filter((diagnostic) => !selectedPath || diagnostic.filePath === selectedPath),
    [diagnostics, selectedPath]
  );

  const groupedFiles = useMemo(() => groupNodes(flattenFiles(tree), filter), [tree, filter]);

  const selectedJson = useMemo(() => {
    try {
      return draftContent ? JSON.parse(draftContent) : undefined;
    } catch {
      return fileContent?.data;
    }
  }, [draftContent, fileContent?.data]);

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

    const kind = detectFileKind(filePath);
    const type = isObject(result.data) && typeof result.data.type === "string" ? result.data.type : undefined;
    if (type) {
      const schemaKind = kind === "power" ? "power" : "condition";
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
    void fetchJson<{ ok: boolean; hasProject: boolean }>("/api/health")
      .then((result) => setServerStatus(result.ok ? "online" : "offline"))
      .catch(() => setServerStatus("offline"));
    void loadProjectState();
  }, [loadProjectState]);

  useEffect(() => {
    if (socketRef.current) return;

    const socket = new WebSocket(`${window.location.origin.replace("http", "ws")}/api/live`);
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

  async function openProject(nextPath?: string) {
    const target = nextPath ?? projectInput;
    const result = await fetchJson<{ projectRoot: string }>("/api/project/open", {
      method: "POST",
      body: JSON.stringify({ path: target })
    });
    setProjectRoot(result.projectRoot);
    setProjectInput(result.projectRoot);
    rememberProject(result.projectRoot, setRecentProjects);
    await loadProjectState();
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
  }

  async function handleVisualFieldChange(key: string, value: unknown) {
    if (!isObject(selectedJson)) return;
    const next = { ...selectedJson, [key]: value };
    setDraftContent(formatJsonDocument(JSON.stringify(next, null, 2)));
    setDirty(true);
  }

  const filteredProblems = selectedDiagnostics.filter(
    (item) => problemFilter === "all" || item.severity === problemFilter
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <h1>Origin Studio</h1>
            <p>Editor local para datapacks Origins/Apoli.</p>
          </div>
        </div>

        <div className="server-card">
          <span className={`server-dot ${serverStatus}`} />
          <Server size={16} />
          <strong>{serverStatus === "online" ? "Server online" : "Server offline"}</strong>
        </div>

        {!projectRoot ? (
          <section className="start-panel">
            <h2>Abrir projeto</h2>
            <input
              value={projectInput}
              onChange={(event) => setProjectInput(event.target.value)}
              placeholder="C:/Users/User/Desktop/MyOriginsDatapack"
            />
            <button className="primary-button" onClick={() => void openProject()}>
              <FolderOpen size={16} />
              Open Project
            </button>
            <div className="recent-list">
              <h3>Recentes</h3>
              {recentProjects.map((project) => (
                <button key={project} className="recent-item" onClick={() => void openProject(project)}>
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
                <button className="ghost-button" onClick={() => void openProject()}>
                  Reopen
                </button>
              </div>
              <label className="search-box">
                <Search size={14} />
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar arquivos" />
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
                      >
                        <FileJson size={14} />
                        <span>{node.relativePath}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <section className="footer-project">
              <small>Projeto aberto</small>
              <strong>{projectRoot}</strong>
            </section>
          </>
        )}
      </aside>

      <main className="workspace">
        {!projectRoot ? (
          <section className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Local-first Origins tooling</p>
              <h2>Abra qualquer datapack e edite os arquivos reais sem export/import.</h2>
              <p>
                O MVP acompanha alteracoes externas, valida tipos conhecidos e preserva campos
                desconhecidos durante a edicao.
              </p>
            </div>
            <div className="hero-grid">
              <div className="hero-card">
                <Hammer size={18} />
                <h3>Visual + JSON</h3>
                <p>Editor visual inicial para campos comuns e Monaco para edicao direta.</p>
              </div>
              <div className="hero-card">
                <AlertCircle size={18} />
                <h3>Diagnosticos uteis</h3>
                <p>Regras genericas de Origins/Apoli sem bloquear salvamento.</p>
              </div>
            </div>
          </section>
        ) : !selectedPath ? (
          <section className="empty-editor">
            <h2>Selecione um arquivo no explorer</h2>
            <p>Abra um power, origin, tag ou arquivo relacionado para editar e validar.</p>
          </section>
        ) : (
          <>
            <header className="editor-header">
              <div>
                <small>{labelForKind(fileContent?.kind)}</small>
                <h2>{fileContent?.filePath}</h2>
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

            <Tabs.Root defaultValue="json" className="tabs-root">
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
                  onFieldChange={(key, value) => void handleVisualFieldChange(key, value)}
                />
              </Tabs.Content>

              <Tabs.Content value="json" className="tab-panel">
                <MonacoEditor
                  height="100%"
                  defaultLanguage={fileContent?.kind === "function" ? "plaintext" : "json"}
                  value={draftContent}
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
                <div className="problem-toolbar">
                  <label>
                    Severity
                    <select value={problemFilter} onChange={(event) => setProblemFilter(event.target.value as typeof problemFilter)}>
                      <option value="all">All</option>
                      <option value="error">Error</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                    </select>
                  </label>
                </div>
                <div className="problem-list">
                  {filteredProblems.map((problem) => (
                    <article key={`${problem.id}-${problem.message}`} className={`problem-card ${problem.severity}`}>
                      <div>
                        <strong>{problem.id}</strong>
                        <p>{problem.message}</p>
                        {problem.suggestion ? <small>{problem.suggestion}</small> : null}
                      </div>
                      <div className="problem-actions">
                        <button
                          className="ghost-button"
                          onClick={() => window.alert(explainMap[problem.id] ?? "Sem explicacao adicional registrada no MVP.")}
                        >
                          Explain
                        </button>
                        {problem.quickFix?.replacement ? (
                          <button
                            className="ghost-button"
                            onClick={() => void applyQuickFix(problem.quickFix!.replacement!)}
                          >
                            {problem.quickFix.label}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </Tabs.Content>

              <Tabs.Content value="references" className="tab-panel">
                <ReferenceInspector json={selectedJson} />
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
  onFieldChange
}: {
  json: unknown;
  schema: SchemaType | null;
  onFieldChange: (key: string, value: unknown) => void;
}) {
  if (!isObject(json)) {
    return <div className="placeholder-panel">Visual editor indisponivel para este arquivo.</div>;
  }

  const knownFields = new Set(schema?.fields.map((field) => field.name) ?? []);
  const customFields = Object.keys(json).filter(
    (key) => !["type", "name", "description"].includes(key) && !knownFields.has(key)
  );

  return (
    <div className="visual-grid">
      <section className="visual-card">
        <h3>Campos principais</h3>
        <FieldRow
          label="type"
          value={String(json.type ?? "")}
          onChange={(value) => onFieldChange("type", value)}
        />
        <FieldRow
          label="name"
          value={String(json.name ?? "")}
          onChange={(value) => onFieldChange("name", value)}
        />
        <FieldRow
          label="description"
          value={String(json.description ?? "")}
          multiline
          onChange={(value) => onFieldChange("description", value)}
        />
      </section>

      <section className="visual-card">
        <h3>Schema fields</h3>
        {(schema?.fields ?? []).map((field) => (
          <FieldRow
            key={field.name}
            label={`${field.name}${field.required ? " *" : ""}`}
            value={stringifyField(json[field.name])}
            hint={field.description ?? undefined}
            onChange={(value) => onFieldChange(field.name, coerceInputValue(value))}
          />
        ))}
      </section>

      <section className="visual-card">
        <h3>Custom / Unknown Fields</h3>
        {customFields.length === 0 ? <p>Nenhum campo custom encontrado.</p> : null}
        {customFields.map((fieldName) => (
          <FieldRow
            key={fieldName}
            label={fieldName}
            value={stringifyField(json[fieldName])}
            multiline
            onChange={(value) => onFieldChange(fieldName, coerceInputValue(value))}
          />
        ))}
      </section>
    </div>
  );
}

function ReferenceInspector({ json }: { json: unknown }) {
  const refs = useMemo(() => collectReferences(json), [json]);

  return (
    <div className="reference-grid">
      {(["power", "tag", "item_modifier", "resource"] as const).map((kind) => (
        <section key={kind} className="visual-card">
          <h3>{labelForKind(kind)}</h3>
          {(refs[kind] ?? []).length === 0 ? <p>Nenhuma referencia detectada.</p> : null}
          {(refs[kind] ?? []).map((id) => (
            <code key={id}>{id}</code>
          ))}
        </section>
      ))}
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  multiline,
  hint
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string | undefined;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
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
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) =>
    node.type === "file" ? [node] : flattenFiles(node.children ?? [])
  );
}

function groupNodes(nodes: TreeNode[], filter: string): Record<string, TreeNode[]> {
  const filtered = nodes.filter((node) =>
    !filter || node.relativePath.toLowerCase().includes(filter.toLowerCase())
  );

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
      return "Problems";
  }
}

function stringifyField(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function coerceInputValue(value: string): unknown {
  if (!value.trim()) return "";
  try {
    return JSON.parse(value);
  } catch {
    if (value === "true") return true;
    if (value === "false") return false;
    if (!Number.isNaN(Number(value)) && value.trim() !== "") return Number(value);
    return value;
  }
}

function detectFileKind(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (/\/data\/[^/]+\/powers\/.+\.json$/i.test(normalized)) return "power";
  if (/\/data\/[^/]+\/origins\/.+\.json$/i.test(normalized)) return "origin";
  if (/\/data\/[^/]+\/origins?_layers\/.+\.json$/i.test(normalized)) return "origin_layer";
  if (/\/data\/[^/]+\/item_modifiers\/.+\.json$/i.test(normalized)) return "item_modifier";
  if (/\/data\/[^/]+\/damage_type\/.+\.json$/i.test(normalized)) return "damage_type";
  if (/\/data\/[^/]+\/functions\/.+\.mcfunction$/i.test(normalized)) return "function";
  if (/\/data\/[^/]+\/tags\/.+\.json$/i.test(normalized)) return "tag";
  return "unknown";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatJsonDocument(content: string): string {
  try {
    return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
  } catch {
    return content;
  }
}

function collectReferences(json: unknown): Record<string, string[]> {
  const references: Record<"power" | "tag" | "item_modifier" | "resource", Set<string>> = {
    power: new Set<string>(),
    tag: new Set<string>(),
    item_modifier: new Set<string>(),
    resource: new Set<string>()
  };

  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!isObject(value)) return;

    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string") {
        if (key === "power" || key === "powers") references.power.add(child);
        if (key === "tag") references.tag.add(child);
        if (key === "item_modifier" || key === "modifier") references.item_modifier.add(child);
        if (key === "resource") references.resource.add(child);
      }
      walk(child);
    }
  };

  walk(json);
  return {
    power: [...references.power],
    tag: [...references.tag],
    item_modifier: [...references.item_modifier],
    resource: [...references.resource]
  };
}
