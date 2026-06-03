import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertCircle, ChevronDown, ChevronRight, Copy, ExternalLink, FileJson, FolderOpen, Hammer, Search, Server, Sparkles } from "lucide-react";
import { apiBase, wsBase } from "./config";
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
];
const explainMap = {
    "action-on-hit-invalid-chance": "Move chance into bientity_condition and use origins:chance in the appropriate context.",
    "action-on-hit-invalid-condition": "Top-level condition is not part of origins:action_on_hit. Use the contextual condition field instead.",
    "invalid-inverted-type": "origins:inverted is not a standalone type. Keep the original condition type and add inverted: true."
};
export function App() {
    const socketRef = useRef(null);
    const editorRef = useRef(null);
    const selectedPathRef = useRef(undefined);
    const projectRootRef = useRef(undefined);
    const [serverStatus, setServerStatus] = useState("checking");
    const [projectRoot, setProjectRoot] = useState();
    const [projectInput, setProjectInput] = useState("");
    const [recentProjects, setRecentProjects] = useState(loadRecentProjects());
    const [tree, setTree] = useState([]);
    const [selectedPath, setSelectedPath] = useState();
    const [projectError, setProjectError] = useState();
    const [fileContent, setFileContent] = useState();
    const [draftContent, setDraftContent] = useState("");
    const [diagnostics, setDiagnostics] = useState([]);
    const [schema, setSchema] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [filter, setFilter] = useState("");
    const [problemFilter, setProblemFilter] = useState("all");
    const [activeTab, setActiveTab] = useState("json");
    const [incomingReferences, setIncomingReferences] = useState([]);
    const selectedDiagnostics = useMemo(() => diagnostics.filter((diagnostic) => !selectedPath || diagnostic.filePath === selectedPath), [diagnostics, selectedPath]);
    const currentFileProblems = useMemo(() => collapseDiagnostics(selectedDiagnostics).filter(bySeverity(problemFilter)), [selectedDiagnostics, problemFilter]);
    const projectProblems = useMemo(() => collapseDiagnostics(diagnostics.filter((diagnostic) => !selectedPath || diagnostic.filePath !== selectedPath)).filter(bySeverity(problemFilter)), [diagnostics, selectedPath, problemFilter]);
    const groupedFiles = useMemo(() => groupNodes(flattenFiles(tree), filter), [tree, filter]);
    const selectedJson = useMemo(() => {
        try {
            return draftContent ? JSON.parse(draftContent) : undefined;
        }
        catch {
            return fileContent?.data;
        }
    }, [draftContent, fileContent?.data]);
    const fileLookup = useMemo(() => buildLookup(flattenFiles(tree)), [tree]);
    const selectedRelativePath = useMemo(() => (selectedPath && projectRoot ? toProjectRelative(projectRoot, selectedPath) : undefined), [projectRoot, selectedPath]);
    const selectedFileName = selectedPath ? basename(selectedPath) : undefined;
    const selectedDirectory = selectedRelativePath ? dirnameLabel(selectedRelativePath) : undefined;
    const selectedFileId = useMemo(() => (selectedRelativePath && fileContent ? deriveIdFromRelativePath(selectedRelativePath, fileContent.kind) : undefined), [selectedRelativePath, fileContent]);
    const referenceGroups = useMemo(() => {
        const groups = collectReferenceGroups(selectedJson);
        return {
            powers: groups.power.map((id) => buildReferenceItem("power", id, fileLookup, currentFileProblems)),
            tags: groups.tag.map((id) => buildReferenceItem("tag", id, fileLookup, currentFileProblems)),
            itemModifiers: groups.item_modifier.map((id) => buildReferenceItem("item_modifier", id, fileLookup, currentFileProblems)),
            resources: groups.resource.map((id) => buildReferenceItem("resource", id, fileLookup, currentFileProblems))
        };
    }, [selectedJson, fileLookup, currentFileProblems]);
    const definitionsCreated = useMemo(() => buildDefinitionsCreated(selectedJson, selectedRelativePath, fileContent?.kind, selectedPath), [selectedJson, selectedRelativePath, fileContent?.kind, selectedPath]);
    const loadProjectState = useCallback(async () => {
        const [projectResponse, treeResponse, problemsResponse] = await Promise.all([
            fetchJson("/api/project"),
            fetchJson("/api/files/tree").catch(() => []),
            fetchJson("/api/problems").catch(() => [])
        ]);
        setProjectRoot(projectResponse.projectRoot);
        setProjectInput(projectResponse.projectRoot ?? "");
        setTree(treeResponse);
        setDiagnostics(problemsResponse);
    }, []);
    const loadFile = useCallback(async (filePath) => {
        const result = await fetchJson(`/api/files/content?path=${encodeURIComponent(filePath)}`);
        setSelectedPath(filePath);
        setFileContent(result);
        setDraftContent(result.raw);
        setDirty(false);
        setActiveTab("json");
        const schemaKind = inferSchemaKindForFile(result.kind);
        const type = isObject(result.data) && typeof result.data.type === "string" ? result.data.type : undefined;
        if (type && schemaKind) {
            const schemaResult = await fetchJson(`/api/schemas/type?kind=${encodeURIComponent(schemaKind)}&type=${encodeURIComponent(type)}`);
            setSchema(schemaResult);
        }
        else {
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
        void fetchJson("/api/health")
            .then((result) => setServerStatus(result.ok ? "online" : "offline"))
            .catch(() => setServerStatus("offline"));
        void loadProjectState();
    }, [loadProjectState]);
    useEffect(() => {
        if (socketRef.current)
            return;
        const socket = new WebSocket(`${wsBase}/api/live`);
        socketRef.current = socket;
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.event === "diagnosticsUpdated") {
                setDiagnostics(message.payload);
            }
            if (message.event === "projectOpened" || message.event === "indexUpdated") {
                void loadProjectState();
            }
            if (message.event === "fileChanged") {
                const payload = message.payload;
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
        const onKeyDown = (event) => {
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
                setIncomingReferences(await fetchJson(`/api/references/power?id=${encodeURIComponent(selectedFileId)}`).catch(() => []));
                return;
            }
            if (fileContent.kind === "item_modifier") {
                setIncomingReferences(await fetchJson(`/api/references/item_modifier?id=${encodeURIComponent(selectedFileId)}`).catch(() => []));
                return;
            }
            if (fileContent.kind === "tag") {
                setIncomingReferences(await fetchJson(`/api/references/tag?id=${encodeURIComponent(selectedFileId)}`).catch(() => []));
                return;
            }
            setIncomingReferences([]);
        }
        void loadIncomingReferences();
    }, [selectedFileId, fileContent]);
    async function openProject(nextPath) {
        const target = (nextPath ?? projectInput).trim();
        if (!target) {
            setProjectError("Enter the datapack folder path.");
            return;
        }
        try {
            setProjectError(undefined);
            const result = await fetchJson("/api/project/open", {
                method: "POST",
                body: JSON.stringify({ path: target })
            });
            setProjectRoot(result.projectRoot);
            setProjectInput(result.projectRoot);
            rememberProject(result.projectRoot, setRecentProjects);
            await loadProjectState();
        }
        catch (error) {
            setProjectError(error instanceof Error ? error.message : "Could not open this project.");
        }
    }
    async function saveFile() {
        if (!selectedPath)
            return;
        await fetchJson("/api/files/content", {
            method: "PUT",
            body: JSON.stringify({ path: selectedPath, content: draftContent })
        });
        await loadFile(selectedPath);
    }
    async function applyQuickFix(replacement) {
        if (!selectedPath)
            return;
        const next = draftContent.replace(/"type"\s*:\s*"origins:inverted"/, replacement);
        setDraftContent(formatJsonDocument(next));
        setDirty(true);
        setActiveTab("json");
    }
    function handleVisualValueChange(pathSegments, value) {
        if (!selectedJson || (!isObject(selectedJson) && !Array.isArray(selectedJson)))
            return;
        const next = structuredClone(selectedJson);
        setValueAtPath(next, pathSegments, value);
        setDraftContent(formatJsonDocument(JSON.stringify(next, null, 2)));
        setDirty(true);
    }
    function goToProblem(diagnostic) {
        if (!diagnostic.range || !editorRef.current) {
            setActiveTab("json");
            return;
        }
        const range = diagnostic.range;
        setActiveTab("json");
        window.requestAnimationFrame(() => {
            const editor = editorRef.current;
            if (!editor)
                return;
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
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand-card", children: [_jsx("div", { className: "brand-mark", children: _jsx(Sparkles, { size: 18 }) }), _jsxs("div", { children: [_jsx("h1", { children: "Origin Studio" }), _jsx("p", { children: "Local-first editor for Origins and Apoli datapacks." })] })] }), _jsxs("div", { className: "server-card", children: [_jsx("span", { className: `server-dot ${serverStatus}` }), _jsx(Server, { size: 16 }), _jsx("strong", { children: serverStatus === "online" ? "Server online" : "Server offline" })] }), !projectRoot ? (_jsxs("section", { className: "start-panel", children: [_jsx("h2", { children: "Open project" }), _jsx("input", { value: projectInput, onChange: (event) => {
                                    setProjectInput(event.target.value);
                                    setProjectError(undefined);
                                }, placeholder: "C:/Users/User/Desktop/MyOriginsDatapack" }), projectError ? _jsx("p", { className: "error-text", children: projectError }) : null, _jsxs("button", { className: "primary-button", disabled: !projectInput.trim(), onClick: () => void openProject(), children: [_jsx(FolderOpen, { size: 16 }), "Open Project"] }), _jsxs("div", { className: "recent-list", children: [_jsx("h3", { children: "Recent projects" }), recentProjects.map((project) => (_jsx("button", { className: "recent-item", onClick: () => void openProject(project), title: project, children: project }, project)))] })] })) : (_jsxs(_Fragment, { children: [_jsxs("section", { className: "project-panel", children: [_jsxs("div", { className: "section-head", children: [_jsx("h2", { children: "Explorer" }), projectRoot ? (_jsx("button", { className: "ghost-button", onClick: () => void openProject(projectRoot), children: "Reopen" })) : null] }), _jsxs("label", { className: "search-box", children: [_jsx(Search, { size: 14 }), _jsx("input", { value: filter, onChange: (event) => setFilter(event.target.value), placeholder: "Search files" })] }), _jsx("div", { className: "explorer-list", children: sectionOrder.map((kind) => (_jsxs("div", { className: "explorer-group", children: [_jsx("h3", { children: labelForKind(kind) }), (groupedFiles[kind] ?? []).map((node) => (_jsxs("button", { className: `file-row ${selectedPath === node.path ? "active" : ""}`, onClick: () => void loadFile(node.path), title: node.relativePath, children: [_jsx(FileJson, { size: 14 }), _jsxs("span", { className: "file-row-content", children: [_jsx("strong", { children: basename(node.relativePath) }), _jsx("small", { children: dirnameLabel(node.relativePath) })] })] }, node.path)))] }, kind))) })] }), _jsxs("section", { className: "footer-project", children: [_jsx("small", { children: "Open project" }), _jsx("strong", { title: projectRoot, children: projectRoot })] })] }))] }), _jsx("main", { className: "workspace", children: !projectRoot ? (_jsxs("section", { className: "hero-panel", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("h2", { children: "Open any datapack and edit the real files without export or import." }), _jsx("p", { children: "The MVP follows external file changes, validates known Origins and Apoli patterns, and preserves unknown fields while you edit." })] }), _jsxs("div", { className: "hero-grid", children: [_jsxs("div", { className: "hero-card", children: [_jsx(Hammer, { size: 18 }), _jsx("h3", { children: "Visual and JSON" }), _jsx("p", { children: "Use structured cards for common fields and Monaco for direct JSON editing." })] }), _jsxs("div", { className: "hero-card", children: [_jsx(AlertCircle, { size: 18 }), _jsx("h3", { children: "Helpful diagnostics" }), _jsx("p", { children: "Validation stays informative and non-blocking while you build incomplete files." })] })] })] })) : !selectedPath ? (_jsxs("section", { className: "empty-editor", children: [_jsx("h2", { children: "Select a file in the explorer" }), _jsx("p", { children: "Open a power, origin, tag, or related file to edit, inspect, and validate it." })] })) : (_jsxs(_Fragment, { children: [_jsxs("header", { className: "editor-header", children: [_jsxs("div", { className: "editor-header-copy", title: selectedPath, children: [_jsx("small", { children: labelForKind(fileContent?.kind) }), _jsx("h2", { children: selectedFileName }), _jsx("p", { children: selectedDirectory })] }), _jsxs("div", { className: "editor-actions", children: [_jsx("span", { className: `status-pill ${dirty ? "dirty" : "saved"}`, children: dirty ? "Modified" : "Saved" }), _jsx("button", { className: "ghost-button", onClick: () => selectedPath && void loadFile(selectedPath), children: "Reload" }), _jsx("button", { className: "primary-button", onClick: () => void saveFile(), children: "Save" })] })] }), _jsxs(Tabs.Root, { value: activeTab, onValueChange: setActiveTab, className: "tabs-root", children: [_jsxs(Tabs.List, { className: "tabs-list", children: [_jsx(Tabs.Trigger, { value: "visual", children: "Visual" }), _jsx(Tabs.Trigger, { value: "json", children: "JSON" }), _jsx(Tabs.Trigger, { value: "problems", children: "Problems" }), _jsx(Tabs.Trigger, { value: "references", children: "References" }), _jsx(Tabs.Trigger, { value: "schema", children: "Raw Schema" })] }), _jsx(Tabs.Content, { value: "visual", className: "tab-panel", children: _jsx(VisualEditor, { json: selectedJson, schema: schema, fileKind: fileContent?.kind, onValueChange: handleVisualValueChange }) }), _jsx(Tabs.Content, { value: "json", className: "tab-panel", children: _jsx(MonacoEditor, { height: "100%", defaultLanguage: fileContent?.kind === "function" ? "plaintext" : "json", value: draftContent, onMount: (editor) => {
                                            editorRef.current = editor;
                                        }, onChange: (value) => {
                                            setDraftContent(value ?? "");
                                            setDirty(true);
                                        }, theme: "vs-dark", options: {
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            roundedSelection: false,
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true
                                        } }) }), _jsx(Tabs.Content, { value: "problems", className: "tab-panel", children: _jsx(ProblemsPanel, { currentFileProblems: currentFileProblems, projectProblems: projectProblems, onExplain: (id) => window.alert(explainMap[id] ?? "No extended explanation is registered in the MVP yet."), onApplyQuickFix: (replacement) => void applyQuickFix(replacement), onGoToProblem: goToProblem }) }), _jsx(Tabs.Content, { value: "references", className: "tab-panel", children: _jsx(ReferenceInspector, { referenceGroups: referenceGroups, definitionsCreated: definitionsCreated, incomingReferences: incomingReferences, onOpenFile: (path) => void loadFile(path) }) }), _jsx(Tabs.Content, { value: "schema", className: "tab-panel", children: _jsx("pre", { className: "schema-panel", children: JSON.stringify(schema, null, 2) }) })] })] })) })] }));
}
function VisualEditor({ json, schema, fileKind, onValueChange }) {
    if (!isObject(json)) {
        return _jsx("div", { className: "placeholder-panel", children: "Visual editing is not available for this file." });
    }
    const identityKeys = new Set(["type", "name", "description"]);
    const schemaFields = (schema?.fields ?? []).filter((field) => !identityKeys.has(field.name));
    const knownFields = new Set(["type", "name", "description", ...schemaFields.map((field) => field.name)]);
    const customFields = Object.keys(json).filter((key) => !knownFields.has(key));
    return (_jsxs("div", { className: "visual-layout", children: [_jsxs(SchemaSection, { title: "Identity", description: "Core metadata for this file.", children: [_jsx(FieldEditor, { path: ["type"], label: "Type", value: json.type, field: { name: "type", type: "string", required: true }, onValueChange: onValueChange }), _jsx(FieldEditor, { path: ["name"], label: "Name", value: json.name, field: { name: "name", type: "string", required: false }, onValueChange: onValueChange }), _jsx(FieldEditor, { path: ["description"], label: "Description", value: json.description, field: { name: "description", type: "string", required: false }, onValueChange: onValueChange })] }), _jsxs(SchemaSection, { title: `${labelForKind(fileKind)} Configuration`, description: "Recognized fields from the current schema.", children: [schemaFields.length === 0 ? _jsx(EmptyState, { text: "No typed configuration fields are available for this file yet." }) : null, schemaFields.map((field) => (_jsx(FieldEditor, { path: [field.name], label: startCase(field.name), value: json[field.name], field: field, onValueChange: onValueChange }, field.name)))] }), _jsxs(SchemaSection, { title: "Custom / Unknown Fields", description: "Fields not recognized by the active schema are preserved as-is.", children: [customFields.length === 0 ? _jsx(EmptyState, { text: "No custom fields detected." }) : null, customFields.map((fieldName) => (_jsx(FieldEditor, { path: [fieldName], label: fieldName, value: json[fieldName], field: { name: fieldName, type: inferFieldType(json[fieldName]), required: false }, onValueChange: onValueChange }, fieldName)))] })] }));
}
function ProblemsPanel({ currentFileProblems, projectProblems, onExplain, onApplyQuickFix, onGoToProblem }) {
    return (_jsxs("div", { className: "problems-layout", children: [_jsxs("div", { className: "problem-toolbar", children: [_jsx("h3", { children: "Current file problems" }), _jsx("p", { children: "Focused diagnostics for the file open in the editor." })] }), _jsxs("div", { className: "problem-list", children: [currentFileProblems.length === 0 ? _jsx(EmptyState, { text: "No problems in this file." }) : null, currentFileProblems.map((problem) => (_jsx(ProblemCard, { diagnostic: problem, onExplain: onExplain, onApplyQuickFix: onApplyQuickFix, onGoToProblem: onGoToProblem }, problemKey(problem))))] }), _jsxs("div", { className: "problem-toolbar problem-toolbar-secondary", children: [_jsx("h3", { children: "Project problems" }), _jsx("p", { children: "Diagnostics from the rest of the open datapack." })] }), _jsxs("div", { className: "problem-list", children: [projectProblems.length === 0 ? _jsx(EmptyState, { text: "No additional project problems." }) : null, projectProblems.map((problem) => (_jsx(ProblemCard, { diagnostic: problem, onExplain: onExplain, onApplyQuickFix: onApplyQuickFix, onGoToProblem: onGoToProblem }, problemKey(problem))))] })] }));
}
function ProblemCard({ diagnostic, onExplain, onApplyQuickFix, onGoToProblem }) {
    return (_jsxs("article", { className: `problem-card ${diagnostic.severity}`, children: [_jsxs("div", { className: "problem-copy", children: [_jsxs("div", { className: "problem-meta", children: [_jsx("span", { className: `severity-badge ${diagnostic.severity}`, children: diagnostic.severity }), _jsx("strong", { children: diagnostic.id }), diagnostic.range ? (_jsxs("span", { className: "problem-location", children: ["L", diagnostic.range.startLine, ":C", diagnostic.range.startColumn] })) : null] }), _jsx("p", { children: diagnostic.message }), diagnostic.suggestion ? _jsx("small", { children: diagnostic.suggestion }) : null, _jsx("code", { className: "problem-file", children: diagnostic.filePath })] }), _jsxs("div", { className: "problem-actions", children: [diagnostic.range ? (_jsx("button", { className: "ghost-button", onClick: () => onGoToProblem(diagnostic), children: "Go to field" })) : null, _jsx("button", { className: "ghost-button", onClick: () => onExplain(diagnostic.id), children: "Explain" }), _jsxs("button", { className: "ghost-button", onClick: () => void copyToClipboard(JSON.stringify(diagnostic, null, 2)), children: [_jsx(Copy, { size: 14 }), "Copy"] }), diagnostic.quickFix?.replacement ? (_jsx("button", { className: "ghost-button", onClick: () => onApplyQuickFix(diagnostic.quickFix.replacement), children: diagnostic.quickFix.label })) : null] })] }));
}
function ReferenceInspector({ referenceGroups, definitionsCreated, incomingReferences, onOpenFile }) {
    return (_jsxs("div", { className: "reference-layout", children: [_jsx(ReferenceCard, { title: "Powers used by this file", items: referenceGroups.powers, emptyText: "No power references detected.", onOpenFile: onOpenFile }), _jsx(ReferenceCard, { title: "Tags used by this file", items: referenceGroups.tags, emptyText: "No tag references detected.", onOpenFile: onOpenFile }), _jsx(ReferenceCard, { title: "Item modifiers used by this file", items: referenceGroups.itemModifiers, emptyText: "No item modifier references detected.", onOpenFile: onOpenFile }), _jsx(ReferenceCard, { title: "Resources used by this file", items: referenceGroups.resources, emptyText: "No resource references detected.", onOpenFile: onOpenFile }), _jsx(DefinitionCard, { title: "Definitions created by this file", items: definitionsCreated }), _jsx(IncomingReferencesCard, { items: incomingReferences, onOpenFile: onOpenFile })] }));
}
function SchemaSection({ title, description, children }) {
    return (_jsxs("section", { className: "visual-card", children: [_jsxs("div", { className: "section-copy", children: [_jsx("h3", { children: title }), _jsx("p", { children: description })] }), _jsx("div", { className: "field-stack", children: children })] }));
}
function FieldEditor({ path, label, value, field, onValueChange }) {
    if (Array.isArray(value)) {
        return _jsx(ArrayFieldEditor, { path: path, label: label, items: value, field: field, onValueChange: onValueChange });
    }
    if (isObject(value)) {
        return _jsx(ObjectFieldEditor, { path: path, label: label, value: value, field: field, onValueChange: onValueChange });
    }
    const isLongText = typeof value === "string" && value.length > 80;
    const allowedValues = field.allowedValues?.filter((item) => !item.startsWith("$")) ?? [];
    return (_jsxs("label", { className: "field-row", children: [_jsxs("span", { children: [label, field.required ? " *" : ""] }), field.description ? _jsx("small", { children: field.description }) : null, allowedValues.length > 0 ? (_jsxs("select", { value: String(value ?? ""), onChange: (event) => onValueChange(path, event.target.value), children: [_jsx("option", { value: "", children: "Select a value" }), allowedValues.map((option) => (_jsx("option", { value: option, children: option }, option)))] })) : typeof value === "boolean" ? (_jsxs("label", { className: "checkbox-row", children: [_jsx("input", { type: "checkbox", checked: value, onChange: (event) => onValueChange(path, event.target.checked) }), _jsx("span", { children: value ? "Enabled" : "Disabled" })] })) : typeof value === "number" ? (_jsx("input", { type: "number", value: String(value), onChange: (event) => onValueChange(path, Number(event.target.value)) })) : isLongText ? (_jsx("textarea", { value: String(value ?? ""), onChange: (event) => onValueChange(path, event.target.value), rows: 4 })) : (_jsx("input", { value: String(value ?? ""), onChange: (event) => onValueChange(path, event.target.value) }))] }));
}
function ObjectFieldEditor({ path, label, value, field, onValueChange }) {
    const entries = Object.entries(value);
    const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2));
    useEffect(() => {
        setRaw(JSON.stringify(value, null, 2));
    }, [value]);
    return (_jsxs("details", { className: "node-card", open: true, children: [_jsxs("summary", { children: [_jsxs("span", { className: "node-card-title", children: [label, typeof value.type === "string" ? _jsx("strong", { children: value.type }) : null] }), _jsxs("span", { className: "node-card-icon", children: [_jsx(ChevronRight, { size: 16 }), _jsx(ChevronDown, { size: 16 })] })] }), _jsxs("div", { className: "node-card-body", children: [field.description ? _jsx("p", { className: "node-card-description", children: field.description }) : null, entries.length === 0 ? _jsx(EmptyState, { text: "This object is currently empty.", compact: true }) : null, entries.map(([childKey, childValue]) => (_jsx(FieldEditor, { path: [...path, childKey], label: startCase(childKey), value: childValue, field: {
                            name: childKey,
                            type: inferFieldType(childValue),
                            required: false
                        }, onValueChange: onValueChange }, childKey))), _jsxs("label", { className: "field-row field-row-raw", children: [_jsx("span", { children: "Raw JSON" }), _jsx("small", { children: "Fallback editor for this nested object." }), _jsx("textarea", { value: raw, rows: 6, onChange: (event) => setRaw(event.target.value) }), _jsx("button", { className: "ghost-button", onClick: () => {
                                    try {
                                        onValueChange(path, JSON.parse(raw));
                                    }
                                    catch {
                                        // keep invalid draft local until the user fixes it
                                    }
                                }, children: "Apply JSON" })] })] })] }));
}
function ArrayFieldEditor({ path, label, items, field, onValueChange }) {
    return (_jsxs("details", { className: "node-card", open: true, children: [_jsxs("summary", { children: [_jsxs("span", { className: "node-card-title", children: [label, _jsxs("strong", { children: [items.length, " items"] })] }), _jsxs("span", { className: "node-card-icon", children: [_jsx(ChevronRight, { size: 16 }), _jsx(ChevronDown, { size: 16 })] })] }), _jsxs("div", { className: "node-card-body", children: [field.description ? _jsx("p", { className: "node-card-description", children: field.description }) : null, items.length === 0 ? _jsx(EmptyState, { text: "This list is currently empty.", compact: true }) : null, _jsx("div", { className: "array-stack", children: items.map((item, index) => (_jsx("div", { className: "array-item", children: _jsx(FieldEditor, { path: [...path, index], label: `${label} ${index + 1}`, value: item, field: {
                                    name: `${field.name}[${index}]`,
                                    type: field.arrayItemType ?? inferFieldType(item),
                                    required: false
                                }, onValueChange: onValueChange }) }, `${label}-${index}`))) })] })] }));
}
function ReferenceCard({ title, items, emptyText, onOpenFile }) {
    return (_jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: title }), items.length === 0 ? _jsx(EmptyState, { text: emptyText, compact: true }) : null, _jsx("div", { className: "reference-stack", children: items.map((item) => (_jsxs("div", { className: "reference-item", children: [_jsxs("div", { children: [_jsx("strong", { children: item.id }), _jsx("small", { children: item.kind }), item.path ? _jsx("code", { children: item.path }) : null] }), _jsxs("div", { className: "reference-actions", children: [_jsx("span", { className: `status-tag ${item.status}`, children: item.status }), _jsxs("button", { className: "ghost-button", onClick: () => void copyToClipboard(item.id), children: [_jsx(Copy, { size: 14 }), "Copy ID"] }), item.path ? (_jsxs("button", { className: "ghost-button", onClick: () => onOpenFile(item.path), children: [_jsx(ExternalLink, { size: 14 }), "Open"] })) : null] })] }, `${item.kind}-${item.id}`))) })] }));
}
function DefinitionCard({ title, items }) {
    return (_jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: title }), items.length === 0 ? _jsx(EmptyState, { text: "This file does not declare known IDs.", compact: true }) : null, _jsx("div", { className: "reference-stack", children: items.map((item) => (_jsxs("div", { className: "reference-item", children: [_jsxs("div", { children: [_jsx("strong", { children: item.id }), _jsx("small", { children: item.kind }), item.path ? _jsx("code", { children: item.path }) : null] }), _jsx("div", { className: "reference-actions", children: _jsxs("button", { className: "ghost-button", onClick: () => void copyToClipboard(item.id), children: [_jsx(Copy, { size: 14 }), "Copy ID"] }) })] }, `${item.kind}-${item.id}`))) })] }));
}
function IncomingReferencesCard({ items, onOpenFile }) {
    return (_jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: "Files referencing this file" }), items.length === 0 ? _jsx(EmptyState, { text: "No incoming references found.", compact: true }) : null, _jsx("div", { className: "reference-stack", children: items.map((item, index) => (_jsxs("div", { className: "reference-item", children: [_jsxs("div", { children: [_jsx("strong", { children: item.id }), _jsx("small", { children: item.kind }), _jsx("code", { children: item.sourcePath })] }), _jsxs("div", { className: "reference-actions", children: [_jsxs("button", { className: "ghost-button", onClick: () => void copyToClipboard(item.id), children: [_jsx(Copy, { size: 14 }), "Copy ID"] }), _jsxs("button", { className: "ghost-button", onClick: () => onOpenFile(item.sourcePath), children: [_jsx(ExternalLink, { size: 14 }), "Open"] })] })] }, `${item.sourcePath}-${index}`))) })] }));
}
function EmptyState({ text, compact }) {
    return _jsx("p", { className: compact ? "empty-state compact" : "empty-state", children: text });
}
function loadRecentProjects() {
    try {
        const raw = window.localStorage.getItem(recentProjectsKey);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
function rememberProject(project, setRecentProjects) {
    const next = [project, ...loadRecentProjects().filter((item) => item !== project)].slice(0, 5);
    window.localStorage.setItem(recentProjectsKey, JSON.stringify(next));
    setRecentProjects(next);
}
async function fetchJson(url, init) {
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
            const parsed = JSON.parse(raw);
            message = parsed.message ?? raw;
        }
        catch {
            message = raw;
        }
        throw new Error(message);
    }
    return response.json();
}
function flattenFiles(nodes) {
    return nodes.flatMap((node) => (node.type === "file" ? [node] : flattenFiles(node.children ?? [])));
}
function groupNodes(nodes, filter) {
    const filtered = nodes.filter((node) => !filter || node.relativePath.toLowerCase().includes(filter.toLowerCase()));
    return filtered.reduce((accumulator, node) => {
        const kind = node.kind ?? "unknown";
        accumulator[kind] ??= [];
        accumulator[kind].push(node);
        return accumulator;
    }, {});
}
function labelForKind(kind) {
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
function inferSchemaKindForFile(kind) {
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
function formatJsonDocument(content) {
    try {
        return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
    }
    catch {
        return content;
    }
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function basename(filePath) {
    return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}
function dirnameLabel(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    parts.pop();
    return parts.length > 0 ? `${parts.join("/")}/` : "";
}
function toProjectRelative(projectRoot, filePath) {
    const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
    const normalizedPath = filePath.replace(/\\/g, "/");
    return normalizedPath.startsWith(normalizedRoot) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}
function bySeverity(filter) {
    return (diagnostic) => filter === "all" || diagnostic.severity === filter;
}
function problemKey(problem) {
    return [problem.id, problem.filePath, problem.message, problem.range?.startLine, problem.range?.startColumn].join(":");
}
function collapseDiagnostics(diagnostics) {
    return [...new Map(diagnostics.map((diagnostic) => [problemKey(diagnostic), diagnostic])).values()];
}
function setValueAtPath(target, path, value) {
    if (path.length === 0)
        return;
    let current = target;
    for (let index = 0; index < path.length - 1; index += 1) {
        const segment = path[index];
        const next = current[segment];
        if (isObject(next) || Array.isArray(next)) {
            current = next;
            continue;
        }
        const nextSegment = path[index + 1];
        const replacement = (typeof nextSegment === "number" ? [] : {});
        current[segment] = replacement;
        current = replacement;
    }
    const lastSegment = path[path.length - 1];
    current[lastSegment] = value;
}
function inferFieldType(value) {
    if (Array.isArray(value))
        return "array";
    if (isObject(value))
        return "object";
    if (typeof value === "boolean")
        return "boolean";
    if (typeof value === "number")
        return "number";
    return "string";
}
function buildLookup(files) {
    const lookup = {};
    for (const file of files) {
        if (!file.kind || file.kind === "unknown")
            continue;
        const id = deriveIdFromRelativePath(file.relativePath, file.kind);
        if (!id)
            continue;
        lookup[id] = {
            id,
            kind: file.kind,
            path: file.path,
            relativePath: file.relativePath
        };
    }
    return lookup;
}
function deriveIdFromRelativePath(relativePath, kind) {
    const normalized = relativePath.replace(/\\/g, "/");
    const jsonMatch = normalized.match(/^data\/([^/]+)\/([^/]+)\/(.+)\.json$/i);
    const functionMatch = normalized.match(/^data\/([^/]+)\/functions\/(.+)\.mcfunction$/i);
    if (kind === "function" && functionMatch) {
        return `${functionMatch[1]}:${functionMatch[2]}`;
    }
    if (!jsonMatch)
        return undefined;
    const [, namespace, folder, localPath] = jsonMatch;
    if (!namespace || !localPath)
        return undefined;
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
function collectReferenceGroups(json) {
    const groups = {
        power: new Set(),
        tag: new Set(),
        item_modifier: new Set(),
        resource: new Set()
    };
    function walk(value, key) {
        if (Array.isArray(value)) {
            if (key === "powers") {
                for (const item of value) {
                    if (typeof item === "string")
                        groups.power.add(item);
                }
            }
            value.forEach((item) => walk(item));
            return;
        }
        if (!isObject(value))
            return;
        for (const [childKey, child] of Object.entries(value)) {
            if (typeof child === "string") {
                if (childKey === "power")
                    groups.power.add(child);
                if (childKey === "tag")
                    groups.tag.add(child);
                if (childKey === "item_modifier" || childKey === "modifier")
                    groups.item_modifier.add(child);
                if (childKey === "resource")
                    groups.resource.add(child);
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
function buildReferenceItem(kind, id, lookup, diagnostics) {
    const missing = diagnostics.some((diagnostic) => diagnostic.message.includes(`"${id}"`) && diagnostic.id.includes("missing"));
    const resolved = lookup[id];
    return {
        id,
        kind,
        status: missing ? "missing" : "found",
        ...(resolved?.path ? { path: resolved.path } : {})
    };
}
function buildDefinitionsCreated(json, relativePath, kind, absolutePath) {
    if (!relativePath || !kind)
        return [];
    const definitions = [];
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
                if (!isObject(child))
                    continue;
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
function collapseDefinitions(definitions) {
    return [...new Map(definitions.map((definition) => [`${definition.kind}:${definition.id}`, definition])).values()];
}
function makeDefinition(id, kind, path) {
    return {
        id,
        kind,
        ...(path ? { path } : {})
    };
}
function startCase(value) {
    return value
        .replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (match) => match.toUpperCase());
}
async function copyToClipboard(value) {
    try {
        await navigator.clipboard.writeText(value);
    }
    catch {
        // ignore clipboard failures in MVP
    }
}
//# sourceMappingURL=App.js.map