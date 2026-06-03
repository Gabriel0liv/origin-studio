import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertCircle, FileJson, FolderOpen, Hammer, Search, Server, Sparkles } from "lucide-react";
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
    "action-on-hit-invalid-chance": "Mova a chance para `bientity_condition` e use `origins:chance` no contexto correto.",
    "action-on-hit-invalid-condition": "O campo `condition` no topo nao faz parte de `origins:action_on_hit`; use a condicao contextual adequada.",
    "invalid-inverted-type": "`origins:inverted` nao existe como type isolado. A forma correta e manter o type original e adicionar `inverted: true`."
};
export function App() {
    const socketRef = useRef(null);
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
    const selectedDiagnostics = useMemo(() => diagnostics.filter((diagnostic) => !selectedPath || diagnostic.filePath === selectedPath), [diagnostics, selectedPath]);
    const groupedFiles = useMemo(() => groupNodes(flattenFiles(tree), filter), [tree, filter]);
    const selectedJson = useMemo(() => {
        try {
            return draftContent ? JSON.parse(draftContent) : undefined;
        }
        catch {
            return fileContent?.data;
        }
    }, [draftContent, fileContent?.data]);
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
        const kind = detectFileKind(filePath);
        const type = isObject(result.data) && typeof result.data.type === "string" ? result.data.type : undefined;
        if (type) {
            const schemaKind = kind === "power" ? "power" : "condition";
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
    async function openProject(nextPath) {
        const target = (nextPath ?? projectInput).trim();
        if (!target) {
            setProjectError("Informe o caminho da pasta do datapack.");
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
            setProjectError(error instanceof Error ? error.message : "Nao foi possivel abrir o projeto.");
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
    }
    async function handleVisualFieldChange(key, value) {
        if (!isObject(selectedJson))
            return;
        const next = { ...selectedJson, [key]: value };
        setDraftContent(formatJsonDocument(JSON.stringify(next, null, 2)));
        setDirty(true);
    }
    const filteredProblems = selectedDiagnostics.filter((item) => problemFilter === "all" || item.severity === problemFilter);
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand-card", children: [_jsx("div", { className: "brand-mark", children: _jsx(Sparkles, { size: 18 }) }), _jsxs("div", { children: [_jsx("h1", { children: "Origin Studio" }), _jsx("p", { children: "Editor local para datapacks Origins/Apoli." })] })] }), _jsxs("div", { className: "server-card", children: [_jsx("span", { className: `server-dot ${serverStatus}` }), _jsx(Server, { size: 16 }), _jsx("strong", { children: serverStatus === "online" ? "Server online" : "Server offline" })] }), !projectRoot ? (_jsxs("section", { className: "start-panel", children: [_jsx("h2", { children: "Abrir projeto" }), _jsx("input", { value: projectInput, onChange: (event) => {
                                    setProjectInput(event.target.value);
                                    setProjectError(undefined);
                                }, placeholder: "C:/Users/User/Desktop/MyOriginsDatapack" }), projectError ? _jsx("p", { className: "error-text", children: projectError }) : null, _jsxs("button", { className: "primary-button", disabled: !projectInput.trim(), onClick: () => void openProject(), children: [_jsx(FolderOpen, { size: 16 }), "Open Project"] }), _jsxs("div", { className: "recent-list", children: [_jsx("h3", { children: "Recentes" }), recentProjects.map((project) => (_jsx("button", { className: "recent-item", onClick: () => void openProject(project), children: project }, project)))] })] })) : (_jsxs(_Fragment, { children: [_jsxs("section", { className: "project-panel", children: [_jsxs("div", { className: "section-head", children: [_jsx("h2", { children: "Explorer" }), projectRoot ? (_jsx("button", { className: "ghost-button", onClick: () => void openProject(projectRoot), children: "Reopen" })) : null] }), _jsxs("label", { className: "search-box", children: [_jsx(Search, { size: 14 }), _jsx("input", { value: filter, onChange: (event) => setFilter(event.target.value), placeholder: "Buscar arquivos" })] }), _jsx("div", { className: "explorer-list", children: sectionOrder.map((kind) => (_jsxs("div", { className: "explorer-group", children: [_jsx("h3", { children: labelForKind(kind) }), (groupedFiles[kind] ?? []).map((node) => (_jsxs("button", { className: `file-row ${selectedPath === node.path ? "active" : ""}`, onClick: () => void loadFile(node.path), children: [_jsx(FileJson, { size: 14 }), _jsx("span", { children: node.relativePath })] }, node.path)))] }, kind))) })] }), _jsxs("section", { className: "footer-project", children: [_jsx("small", { children: "Projeto aberto" }), _jsx("strong", { children: projectRoot })] })] }))] }), _jsx("main", { className: "workspace", children: !projectRoot ? (_jsxs("section", { className: "hero-panel", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Local-first Origins tooling" }), _jsx("h2", { children: "Abra qualquer datapack e edite os arquivos reais sem export/import." }), _jsx("p", { children: "O MVP acompanha alteracoes externas, valida tipos conhecidos e preserva campos desconhecidos durante a edicao." })] }), _jsxs("div", { className: "hero-grid", children: [_jsxs("div", { className: "hero-card", children: [_jsx(Hammer, { size: 18 }), _jsx("h3", { children: "Visual + JSON" }), _jsx("p", { children: "Editor visual inicial para campos comuns e Monaco para edicao direta." })] }), _jsxs("div", { className: "hero-card", children: [_jsx(AlertCircle, { size: 18 }), _jsx("h3", { children: "Diagnosticos uteis" }), _jsx("p", { children: "Regras genericas de Origins/Apoli sem bloquear salvamento." })] })] })] })) : !selectedPath ? (_jsxs("section", { className: "empty-editor", children: [_jsx("h2", { children: "Selecione um arquivo no explorer" }), _jsx("p", { children: "Abra um power, origin, tag ou arquivo relacionado para editar e validar." })] })) : (_jsxs(_Fragment, { children: [_jsxs("header", { className: "editor-header", children: [_jsxs("div", { children: [_jsx("small", { children: labelForKind(fileContent?.kind) }), _jsx("h2", { children: fileContent?.filePath })] }), _jsxs("div", { className: "editor-actions", children: [_jsx("span", { className: `status-pill ${dirty ? "dirty" : "saved"}`, children: dirty ? "Modified" : "Saved" }), _jsx("button", { className: "ghost-button", onClick: () => selectedPath && void loadFile(selectedPath), children: "Reload" }), _jsx("button", { className: "primary-button", onClick: () => void saveFile(), children: "Save" })] })] }), _jsxs(Tabs.Root, { defaultValue: "json", className: "tabs-root", children: [_jsxs(Tabs.List, { className: "tabs-list", children: [_jsx(Tabs.Trigger, { value: "visual", children: "Visual" }), _jsx(Tabs.Trigger, { value: "json", children: "JSON" }), _jsx(Tabs.Trigger, { value: "problems", children: "Problems" }), _jsx(Tabs.Trigger, { value: "references", children: "References" }), _jsx(Tabs.Trigger, { value: "schema", children: "Raw Schema" })] }), _jsx(Tabs.Content, { value: "visual", className: "tab-panel", children: _jsx(VisualEditor, { json: selectedJson, schema: schema, onFieldChange: (key, value) => void handleVisualFieldChange(key, value) }) }), _jsx(Tabs.Content, { value: "json", className: "tab-panel", children: _jsx(MonacoEditor, { height: "100%", defaultLanguage: fileContent?.kind === "function" ? "plaintext" : "json", value: draftContent, onChange: (value) => {
                                            setDraftContent(value ?? "");
                                            setDirty(true);
                                        }, theme: "vs-dark", options: {
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            roundedSelection: false,
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true
                                        } }) }), _jsxs(Tabs.Content, { value: "problems", className: "tab-panel", children: [_jsx("div", { className: "problem-toolbar", children: _jsxs("label", { children: ["Severity", _jsxs("select", { value: problemFilter, onChange: (event) => setProblemFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All" }), _jsx("option", { value: "error", children: "Error" }), _jsx("option", { value: "warning", children: "Warning" }), _jsx("option", { value: "info", children: "Info" })] })] }) }), _jsx("div", { className: "problem-list", children: filteredProblems.map((problem) => (_jsxs("article", { className: `problem-card ${problem.severity}`, children: [_jsxs("div", { children: [_jsx("strong", { children: problem.id }), _jsx("p", { children: problem.message }), problem.suggestion ? _jsx("small", { children: problem.suggestion }) : null] }), _jsxs("div", { className: "problem-actions", children: [_jsx("button", { className: "ghost-button", onClick: () => window.alert(explainMap[problem.id] ?? "Sem explicacao adicional registrada no MVP."), children: "Explain" }), problem.quickFix?.replacement ? (_jsx("button", { className: "ghost-button", onClick: () => void applyQuickFix(problem.quickFix.replacement), children: problem.quickFix.label })) : null] })] }, `${problem.id}-${problem.message}`))) })] }), _jsx(Tabs.Content, { value: "references", className: "tab-panel", children: _jsx(ReferenceInspector, { json: selectedJson }) }), _jsx(Tabs.Content, { value: "schema", className: "tab-panel", children: _jsx("pre", { className: "schema-panel", children: JSON.stringify(schema, null, 2) }) })] })] })) })] }));
}
function VisualEditor({ json, schema, onFieldChange }) {
    if (!isObject(json)) {
        return _jsx("div", { className: "placeholder-panel", children: "Visual editor indisponivel para este arquivo." });
    }
    const knownFields = new Set(schema?.fields.map((field) => field.name) ?? []);
    const customFields = Object.keys(json).filter((key) => !["type", "name", "description"].includes(key) && !knownFields.has(key));
    return (_jsxs("div", { className: "visual-grid", children: [_jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: "Campos principais" }), _jsx(FieldRow, { label: "type", value: String(json.type ?? ""), onChange: (value) => onFieldChange("type", value) }), _jsx(FieldRow, { label: "name", value: String(json.name ?? ""), onChange: (value) => onFieldChange("name", value) }), _jsx(FieldRow, { label: "description", value: String(json.description ?? ""), multiline: true, onChange: (value) => onFieldChange("description", value) })] }), _jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: "Schema fields" }), (schema?.fields ?? []).map((field) => (_jsx(FieldRow, { label: `${field.name}${field.required ? " *" : ""}`, value: stringifyField(json[field.name]), hint: field.description ?? undefined, onChange: (value) => onFieldChange(field.name, coerceInputValue(value)) }, field.name)))] }), _jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: "Custom / Unknown Fields" }), customFields.length === 0 ? _jsx("p", { children: "Nenhum campo custom encontrado." }) : null, customFields.map((fieldName) => (_jsx(FieldRow, { label: fieldName, value: stringifyField(json[fieldName]), multiline: true, onChange: (value) => onFieldChange(fieldName, coerceInputValue(value)) }, fieldName)))] })] }));
}
function ReferenceInspector({ json }) {
    const refs = useMemo(() => collectReferences(json), [json]);
    return (_jsx("div", { className: "reference-grid", children: ["power", "tag", "item_modifier", "resource"].map((kind) => (_jsxs("section", { className: "visual-card", children: [_jsx("h3", { children: labelForKind(kind) }), (refs[kind] ?? []).length === 0 ? _jsx("p", { children: "Nenhuma referencia detectada." }) : null, (refs[kind] ?? []).map((id) => (_jsx("code", { children: id }, id)))] }, kind))) }));
}
function FieldRow({ label, value, onChange, multiline, hint }) {
    return (_jsxs("label", { className: "field-row", children: [_jsx("span", { children: label }), multiline ? (_jsx("textarea", { value: value, onChange: (event) => onChange(event.target.value), rows: 4 })) : (_jsx("input", { value: value, onChange: (event) => onChange(event.target.value) })), hint ? _jsx("small", { children: hint }) : null] }));
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
    return nodes.flatMap((node) => node.type === "file" ? [node] : flattenFiles(node.children ?? []));
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
            return "Problems";
    }
}
function stringifyField(value) {
    if (typeof value === "string")
        return value;
    if (value === undefined)
        return "";
    return JSON.stringify(value, null, 2);
}
function coerceInputValue(value) {
    if (!value.trim())
        return "";
    try {
        return JSON.parse(value);
    }
    catch {
        if (value === "true")
            return true;
        if (value === "false")
            return false;
        if (!Number.isNaN(Number(value)) && value.trim() !== "")
            return Number(value);
        return value;
    }
}
function detectFileKind(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    if (/\/data\/[^/]+\/powers\/.+\.json$/i.test(normalized))
        return "power";
    if (/\/data\/[^/]+\/origins\/.+\.json$/i.test(normalized))
        return "origin";
    if (/\/data\/[^/]+\/origins?_layers\/.+\.json$/i.test(normalized))
        return "origin_layer";
    if (/\/data\/[^/]+\/item_modifiers\/.+\.json$/i.test(normalized))
        return "item_modifier";
    if (/\/data\/[^/]+\/damage_type\/.+\.json$/i.test(normalized))
        return "damage_type";
    if (/\/data\/[^/]+\/functions\/.+\.mcfunction$/i.test(normalized))
        return "function";
    if (/\/data\/[^/]+\/tags\/.+\.json$/i.test(normalized))
        return "tag";
    return "unknown";
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatJsonDocument(content) {
    try {
        return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
    }
    catch {
        return content;
    }
}
function collectReferences(json) {
    const references = {
        power: new Set(),
        tag: new Set(),
        item_modifier: new Set(),
        resource: new Set()
    };
    const walk = (value) => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isObject(value))
            return;
        for (const [key, child] of Object.entries(value)) {
            if (typeof child === "string") {
                if (key === "power" || key === "powers")
                    references.power.add(child);
                if (key === "tag")
                    references.tag.add(child);
                if (key === "item_modifier" || key === "modifier")
                    references.item_modifier.add(child);
                if (key === "resource")
                    references.resource.add(child);
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
//# sourceMappingURL=App.js.map