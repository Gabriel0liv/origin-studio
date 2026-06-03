import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditorApi } from "monaco-editor";
import { AlertCircle, Hammer } from "lucide-react";
import { apiBase, wsBase } from "./config";
import { AppShell } from "./components/AppShell";
import { BuilderLayout } from "./components/BuilderLayout";
import { FileHeader } from "./components/FileHeader";
import { FunctionEditor } from "./components/FunctionEditor";
import { ItemModifierBuilder } from "./components/ItemModifierBuilder";
import { JsonDrawer } from "./components/JsonDrawer";
import { JsonOnlyEditor } from "./components/JsonOnlyEditor";
import { NewFileWizard } from "./components/NewFileWizard";
import { OriginBuilder } from "./components/OriginBuilder";
import { OriginLayerBuilder } from "./components/OriginLayerBuilder";
import { PowerBuilder } from "./components/PowerBuilder";
import { ProblemsPanel } from "./components/ProblemsPanel";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { ReferencesPanel } from "./components/ReferencesPanel";
import { SidePanelDrawer } from "./components/SidePanelDrawer";
import { TagBuilder } from "./components/TagBuilder";
import type { Diagnostic, FileContentResponse, FileReference, NewFileDraft, NewFileKind, OpenDocumentState, SchemaField, SchemaType, TreeNode } from "./types";
import { buildDefaultDraft, buildDefinitionsCreated, buildLookup, buildNewFileContent, buildNewFilePath, buildReferenceItem, bySeverity, collapseDiagnostics, collectReferenceGroups, deriveIdFromRelativePath, explainMap, fetchJson, flattenFiles, formatJsonDocument, getValueAtPath, groupNodes, inferNamespaces, inferSchemaKindForFile, isObject, loadRecentProjects, rememberProject, setValueAtPath, toProjectRelative } from "./utils";

const schemaKinds = ["power", "origin", "origin_layer", "item_modifier", "tag", "condition", "entity_action", "bientity_action", "bientity_condition", "item_condition", "damage_condition"];

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const selectedPathRef = useRef<string | undefined>(undefined);
  const projectRootRef = useRef<string | undefined>(undefined);
  const [serverStatus, setServerStatus] = useState("checking");
  const [projectRoot, setProjectRoot] = useState<string>();
  const [projectInput, setProjectInput] = useState("");
  const [projectError, setProjectError] = useState<string>();
  const [recentProjects, setRecentProjects] = useState<string[]>(loadRecentProjects());
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [documentState, setDocumentState] = useState<OpenDocumentState>();
  const [schemaOptionsByKind, setSchemaOptionsByKind] = useState<Record<string, SchemaType[]>>({});
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardDraft, setWizardDraft] = useState<NewFileDraft>(buildDefaultDraft("power", ["example"]));
  const [filter, setFilter] = useState("");
  const [selectedField, setSelectedField] = useState<{ path: Array<string | number>; field: SchemaField } | null>(null);
  const [drawerMode, setDrawerMode] = useState<"help" | "problems" | "references" | null>(null);

  const allFiles = useMemo(() => flattenFiles(tree), [tree]);
  const groupedFiles = useMemo(() => groupNodes(allFiles, filter), [allFiles, filter]);
  const fileLookup = useMemo(() => buildLookup(allFiles), [allFiles]);
  const namespaces = useMemo(() => inferNamespaces(projectRoot, tree), [projectRoot, tree]);

  const currentFileProblems = useMemo(() => collapseDiagnostics(diagnostics.filter((diagnostic) => diagnostic.filePath === documentState?.filePath)), [diagnostics, documentState?.filePath]);

  const projectProblems = useMemo(() => collapseDiagnostics(diagnostics.filter((diagnostic) => diagnostic.filePath !== documentState?.filePath)), [diagnostics, documentState?.filePath]);

  const referenceGroups = useMemo(() => {
    const groups = collectReferenceGroups(documentState?.parsed);

    return {
      powers: groups.power.map((id) => buildReferenceItem("power", id, fileLookup, currentFileProblems)),
      tags: groups.tag.map((id) => buildReferenceItem("tag", id, fileLookup, currentFileProblems)),
      itemModifiers: groups.item_modifier.map((id) => buildReferenceItem("item_modifier", id, fileLookup, currentFileProblems)),
      resources: groups.resource.map((id) => buildReferenceItem("resource", id, fileLookup, currentFileProblems)),
      functions: groups.function.map((id) => buildReferenceItem("function", id, fileLookup, currentFileProblems)),
    };
  }, [documentState?.parsed, fileLookup, currentFileProblems]);

  const definitionsCreated = useMemo(() => buildDefinitionsCreated(documentState?.parsed, documentState?.relativePath, documentState?.kind, documentState?.filePath), [documentState]);

  const selectedFieldValue = useMemo(() => (selectedField && documentState?.parsed ? getValueAtPath(documentState.parsed, selectedField.path) : undefined), [selectedField, documentState?.parsed]);

  const drawerTitle = useMemo(() => {
    switch (drawerMode) {
      case "help":
        return "Help";
      case "problems":
        return "Problems";
      case "references":
        return "References";
      default:
        return "";
    }
  }, [drawerMode]);

  const loadSchemaOptions = useCallback(async () => {
    const results = await Promise.all(schemaKinds.map(async (kind) => [kind, await fetchJson<SchemaType[]>(apiBase, `/api/schemas/types?kind=${encodeURIComponent(kind)}`).catch(() => [])] as const));

    setSchemaOptionsByKind(Object.fromEntries(results));
  }, []);

  const loadProjectState = useCallback(async () => {
    const [projectResponse, treeResponse, problemsResponse] = await Promise.all([fetchJson<{ projectRoot?: string }>(apiBase, "/api/project"), fetchJson<TreeNode[]>(apiBase, "/api/files/tree").catch(() => []), fetchJson<Diagnostic[]>(apiBase, "/api/problems").catch(() => [])]);

    setProjectRoot(projectResponse.projectRoot);
    setProjectInput(projectResponse.projectRoot ?? "");
    setTree(treeResponse);
    setDiagnostics(problemsResponse);
  }, []);

  const loadDocumentReferences = useCallback(async (fileKind: string, id?: string): Promise<FileReference[]> => {
    if (!id) return [];

    if (fileKind === "power") {
      return fetchJson<FileReference[]>(apiBase, `/api/references/power?id=${encodeURIComponent(id)}`).catch(() => []);
    }

    if (fileKind === "item_modifier") {
      return fetchJson<FileReference[]>(apiBase, `/api/references/item_modifier?id=${encodeURIComponent(id)}`).catch(() => []);
    }

    if (fileKind === "tag") {
      return fetchJson<FileReference[]>(apiBase, `/api/references/tag?id=${encodeURIComponent(id)}`).catch(() => []);
    }

    return [];
  }, []);

  const loadFile = useCallback(
    async (filePath: string) => {
      const result = await fetchJson<FileContentResponse>(apiBase, `/api/files/content?path=${encodeURIComponent(filePath)}`);
      const relativePath = projectRoot ? toProjectRelative(projectRoot, filePath) : result.filePath;
      const schemaKind = inferSchemaKindForFile(result.kind);
      const type = isObject(result.data) && typeof result.data.type === "string" ? result.data.type : undefined;
      const schema = schemaKind && type ? await fetchJson<SchemaType | null>(apiBase, `/api/schemas/type?kind=${encodeURIComponent(schemaKind)}&type=${encodeURIComponent(type)}`).catch(() => null) : null;
      const ownId = deriveIdFromRelativePath(relativePath, result.kind);
      const incomingReferences = await loadDocumentReferences(result.kind, ownId);

      setDocumentState({
        filePath,
        relativePath,
        kind: result.kind,
        raw: result.raw,
        parsed: result.data,
        dirty: false,
        diagnostics: diagnostics.filter((diagnostic) => diagnostic.filePath === filePath),
        schema,
        incomingReferences,
      });
      setSelectedField(null);
    },
    [diagnostics, loadDocumentReferences, projectRoot],
  );

  useEffect(() => {
    selectedPathRef.current = documentState?.filePath;
  }, [documentState?.filePath]);

  useEffect(() => {
    projectRootRef.current = projectRoot;
  }, [projectRoot]);

  useEffect(() => {
    void fetchJson<{ ok: boolean }>(apiBase, "/api/health")
      .then((result) => setServerStatus(result.ok ? "online" : "offline"))
      .catch(() => setServerStatus("offline"));
    void loadProjectState();
    void loadSchemaOptions();
  }, [loadProjectState, loadSchemaOptions]);

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

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [loadFile, loadProjectState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && documentState) {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function openProject(nextPath?: string) {
    const target = (nextPath ?? projectInput).trim();

    if (!target) {
      setProjectError("Enter the datapack folder path.");
      return;
    }

    try {
      setProjectError(undefined);
      const result = await fetchJson<{ projectRoot: string }>(apiBase, "/api/project/open", {
        method: "POST",
        body: JSON.stringify({ path: target }),
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
    if (!documentState) return;
    await fetchJson(apiBase, "/api/files/content", {
      method: "PUT",
      body: JSON.stringify({ path: documentState.filePath, content: documentState.raw }),
    });
    await loadFile(documentState.filePath);
  }

  async function reloadFile() {
    if (!documentState) return;
    if (documentState.dirty && !window.confirm("Discard unsaved changes and reload from disk?")) {
      return;
    }
    await loadFile(documentState.filePath);
  }

  function updateDocumentFromRaw(raw: string) {
    setDocumentState((current) => {
      if (!current) return current;

      let parsed = current.parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = current.parsed;
      }

      return {
        ...current,
        raw,
        parsed,
        dirty: true,
      };
    });
  }

  function handleVisualValueChange(path: Array<string | number>, value: unknown) {
    setDocumentState((current) => {
      if (!current || (!isObject(current.parsed) && !Array.isArray(current.parsed))) return current;
      const next = structuredClone(current.parsed);
      setValueAtPath(next, path, value);
      return {
        ...current,
        parsed: next,
        raw: formatJsonDocument(JSON.stringify(next, null, 2)),
        dirty: true,
      };
    });
  }

  function openWizard(kind: NewFileKind) {
    setWizardDraft(buildDefaultDraft(kind, namespaces));
    setWizardOpen(true);
  }

  function importProject() {
    const suggested = projectRoot ?? projectInput;
    const nextPath = window.prompt("Enter the datapack folder path:", suggested);
    if (nextPath?.trim()) {
      void openProject(nextPath);
    }
  }

  async function createFolder() {
    if (!projectRoot) return;

    const path = window.prompt("Folder path relative to the project root:", "data/example/new_folder");
    if (!path?.trim()) return;

    await fetchJson(apiBase, "/api/files/folder", {
      method: "POST",
      body: JSON.stringify({ path: path.trim() }),
    });

    await loadProjectState();
  }

  async function createFileFromWizard() {
    if (!projectRoot) return;
    const targetPath = buildNewFilePath(projectRoot, wizardDraft);
    const content = formatJsonDocument(JSON.stringify(buildNewFileContent(wizardDraft), null, 2));

    await fetchJson(apiBase, "/api/files/content", {
      method: "PUT",
      body: JSON.stringify({ path: targetPath, content }),
    });

    setWizardOpen(false);
    await loadProjectState();
    await loadFile(targetPath);
  }

  function goToProblem(diagnostic: Diagnostic) {
    if (!diagnostic.range || !editorRef.current) {
      setIsJsonOpen(true);
      return;
    }

    setIsJsonOpen(true);
    const range = diagnostic.range;
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(range.startLine);
      editor.setSelection({
        startLineNumber: range.startLine,
        startColumn: range.startColumn,
        endLineNumber: range.endLine,
        endColumn: range.endColumn,
      });
      editor.focus();
    });
  }

  function applyQuickFix(replacement: string) {
    if (!documentState) return;
    const next = documentState.raw.replace(/"type"\s*:\s*"origins:inverted"/, replacement);
    updateDocumentFromRaw(formatJsonDocument(next));
  }

  const sidebar = (
    <ProjectSidebar
      serverStatus={serverStatus}
      projectRoot={projectRoot}
      projectInput={projectInput}
      projectError={projectError}
      recentProjects={recentProjects}
      groupedFiles={groupedFiles}
      selectedPath={documentState?.filePath}
      filter={filter}
      onProjectInputChange={(value) => {
        setProjectInput(value);
        setProjectError(undefined);
      }}
      onOpenProject={(path) => void openProject(path)}
      onImportProject={importProject}
      onOpenHelp={() => setDrawerMode("help")}
      onCreateFolder={() => void createFolder()}
      onQuickCreate={openWizard}
      onFilterChange={setFilter}
      onSelectFile={(path) => void loadFile(path)}
    />
  );

  if (!projectRoot) {
    return (
      <AppShell sidebar={sidebar}>
        <main className="workspace">
          <section className="hero-panel">
            <div className="hero-copy">
              <h2>Build datapacks visually, keep JSON as an advanced mode, and edit the real files on disk.</h2>
              <p>Origin Studio now starts from a builder-first workflow: choose a type, fill structured fields, nest actions and conditions as blocks, and keep validation close to the field that needs attention.</p>
            </div>
            <div className="hero-grid">
              <div className="hero-card">
                <Hammer size={18} />
                <h3>Schema-driven builder</h3>
                <p>Pick a type, add optional fields, and edit nested action trees as structured cards.</p>
              </div>
              <div className="hero-card">
                <AlertCircle size={18} />
                <h3>Inline validation</h3>
                <p>Problems stay visible beside the builder and inline on affected fields.</p>
              </div>
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  const header = <FileHeader kindLabel={labelForDocumentKind(documentState?.kind)} documentId={documentState ? deriveIdFromRelativePath(documentState.relativePath, documentState.kind) ?? documentState.relativePath.replace(/\\/g, "/") : undefined} directory={documentState ? toDirectory(documentState.relativePath) : undefined} absolutePath={documentState?.filePath} dirty={Boolean(documentState?.dirty)} problemCount={currentFileProblems.length} onSave={() => void saveFile()} onReload={() => void reloadFile()} onOpenJson={() => setIsJsonOpen(true)} onOpenProblems={() => setDrawerMode("problems")} onOpenReferences={() => setDrawerMode("references")} onOpenHelp={() => setDrawerMode("help")} />;

  const builder = documentState ? (
    renderBuilder(documentState, schemaOptionsByKind, fileLookup, currentFileProblems, handleVisualValueChange, setSelectedField, (path) => void loadFile(path), () => setIsJsonOpen(true))
  ) : (
    <section className="empty-editor">
      <h2>Select a file or create a new one</h2>
      <p>Use the sidebar icons to create a folder or a new structured file.</p>
    </section>
  );

  return (
    <>
      <AppShell sidebar={sidebar}>
        <BuilderLayout header={header} builder={builder} />
      </AppShell>

      <SidePanelDrawer
        open={drawerMode !== null}
        title={drawerTitle}
        description={drawerMode === "help" ? "Contextual help, links, and future flow guidance." : drawerMode === "problems" ? "Current file first, then the rest of the project." : "Open, copy, and inspect related IDs without leaving the builder."}
        onOpenChange={(open) => {
          if (!open) setDrawerMode(null);
        }}
      >
        {drawerMode === "help" ? (
          <section className="inspector-card drawer-card">
            <div className="inspector-group">
              <h4>Current selection</h4>
              {selectedField ? (
                <div className="inspector-field-body">
                  <strong>{selectedField.field.name}</strong>
                  <small>{selectedField.field.type}</small>
                  {selectedField.field.description ? <p>{selectedField.field.description}</p> : <p>Schema coverage is partial for this field. The current value is preserved.</p>}
                  <pre className="json-preview">{JSON.stringify(selectedFieldValue, null, 2)}</pre>
                </div>
              ) : (
                <p className="empty-state compact">Select a field in the builder to inspect it here.</p>
              )}
            </div>

            <div className="inspector-group">
              <h4>Flow Help</h4>
              <p className="empty-state compact">
                The future <code>@origin-studio/flow-help-adapter</code> will normalize <code>index.yaml</code> and the pages under <code>data/</code> from the <code>origins-flow-help</code> repository into guided local help.
              </p>
            </div>

            <div className="inspector-group">
              <h4>Useful links</h4>
              <a className="ghost-button compact help-link" href="https://github.com/mathgeniuszach/origins-flow-help" target="_blank" rel="noreferrer">
                origins-flow-help repository
              </a>
              <a className="ghost-button compact help-link" href="https://github.com/mathgeniuszach/origin-creator-schemas" target="_blank" rel="noreferrer">
                origin-creator-schemas repository
              </a>
            </div>

            <div className="inspector-group">
              <h4>Loaded schema</h4>
              {documentState?.schema ? <pre className="json-preview">{JSON.stringify(documentState.schema, null, 2)}</pre> : <p className="empty-state compact">No schema was resolved for this file yet.</p>}
            </div>
          </section>
        ) : null}

        {drawerMode === "problems" ? <ProblemsPanel currentFileProblems={currentFileProblems.filter(bySeverity("all"))} projectProblems={projectProblems.filter(bySeverity("all"))} onExplain={(id) => window.alert(explainMap[id] ?? "No extended explanation is registered in the MVP yet.")} onApplyQuickFix={applyQuickFix} onGoToProblem={goToProblem} /> : null}

        {drawerMode === "references" ? <ReferencesPanel referenceGroups={referenceGroups} definitionsCreated={definitionsCreated} incomingReferences={documentState?.incomingReferences ?? []} onOpenFile={(path) => void loadFile(path)} /> : null}
      </SidePanelDrawer>

      <JsonDrawer
        open={isJsonOpen}
        value={documentState?.raw ?? ""}
        fileKind={documentState?.kind}
        onOpenChange={setIsJsonOpen}
        onEditorMount={(editor) => {
          editorRef.current = editor;
        }}
        onChange={updateDocumentFromRaw}
      />

      <NewFileWizard open={wizardOpen} draft={wizardDraft} namespaces={namespaces} powerTypes={schemaOptionsByKind.power ?? []} onOpenChange={setWizardOpen} onDraftChange={setWizardDraft} onCreate={() => void createFileFromWizard()} />
    </>
  );
}

function renderBuilder(documentState: OpenDocumentState, schemaOptionsByKind: Record<string, SchemaType[]>, fileLookup: ReturnType<typeof buildLookup>, currentFileProblems: Diagnostic[], onValueChange: (path: Array<string | number>, value: unknown) => void, onFieldFocus: (value: { path: Array<string | number>; field: SchemaField } | null) => void, onOpenReference: (path: string) => void, onOpenJson: () => void) {
  const commonProps = {
    value: documentState.parsed,
    schema: documentState.schema,
    diagnostics: currentFileProblems,
    optionsByKind: schemaOptionsByKind,
    lookup: fileLookup,
    onValueChange,
    onOpenReference,
    onFieldFocus: (path: Array<string | number>, field: SchemaField) => onFieldFocus({ path, field }),
  };

  switch (documentState.kind) {
    case "power":
      return <PowerBuilder {...commonProps} />;
    case "origin":
      return <OriginBuilder {...commonProps} />;
    case "origin_layer":
      return <OriginLayerBuilder {...commonProps} />;
    case "item_modifier":
      return <ItemModifierBuilder {...commonProps} />;
    case "tag":
      return <TagBuilder {...commonProps} />;
    case "function":
      return <FunctionEditor raw={documentState.raw} onOpenJson={onOpenJson} />;
    default:
      return <JsonOnlyEditor title="No visual builder for this file type yet." description="Use the advanced JSON drawer to edit this file directly while Origin Studio keeps the real file on disk in sync." onOpenJson={onOpenJson} />;
  }
}

function toDirectory(relativePath?: string): string | undefined {
  if (!relativePath) return undefined;
  const parts = relativePath.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : undefined;
}

function labelForDocumentKind(kind?: string): string {
  switch (kind) {
    case "origin":
      return "Origin";
    case "origin_layer":
      return "Origin Layer";
    case "power":
      return "Power";
    case "item_modifier":
      return "Item Modifier";
    case "tag":
      return "Tag";
    case "function":
      return "Function";
    case "damage_type":
      return "Damage Type";
    default:
      return "File";
  }
}
