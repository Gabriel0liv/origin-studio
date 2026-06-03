import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import chokidar, { type FSWatcher } from "chokidar";
import { z } from "zod";
import {
  applyJsonPatch,
  detectFileKind,
  ensureWithinRoot,
  formatJsonDocument,
  readJsonFile,
  relativeUnixPath
} from "@origin-studio/core";
import {
  getSchemaKinds,
  getTypeDefinition,
  getTypesForKind,
  loadSchemaRegistry,
  type SchemaRegistry
} from "@origin-studio/origin-creator-adapter";
import { listProfiles, loadProfile, type OriginStudioProfileConfig } from "@origin-studio/profiles";
import { getReferencesTo, indexProject, type ProjectIndex } from "@origin-studio/project-indexer";
import { validateFile, validateProject } from "@origin-studio/validator";

interface ServerState {
  projectRoot?: string;
  projectIndex?: ProjectIndex;
  diagnostics: Awaited<ReturnType<typeof validateProject>>;
  profile: OriginStudioProfileConfig;
  schemaRegistry: SchemaRegistry;
  watcher?: FSWatcher;
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const schemaDir = path.join(repoRoot, "schemas", "origin-creator-schemas");
const host = "127.0.0.1";
const port = 8787;

const app = Fastify({ logger: true });
await app.register(cors, { origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/] });
await app.register(websocket);

const state: ServerState = {
  diagnostics: [],
  profile: await loadProfile(),
  schemaRegistry: await loadSchemaRegistry(schemaDir)
};

type LiveSocket = {
  send(data: string): void;
  on(event: "close", listener: () => void): void;
};

const sockets = new Set<LiveSocket>();

app.get("/api/health", async () => ({
  ok: true,
  host,
  port,
  hasProject: Boolean(state.projectRoot),
  schemaKinds: getSchemaKinds(state.schemaRegistry)
}));

app.get("/api/project", async () => ({
  projectRoot: state.projectRoot,
  profile: state.profile.profile
}));

app.post("/api/project/open", async (request) => {
  const body = z.object({ path: z.string().min(1) }).parse(request.body);
  const projectRoot = path.resolve(body.path);
  await openProject(projectRoot);
  return {
    ok: true,
    projectRoot,
    summary: summarizeIndex(state.projectIndex)
  };
});

app.get("/api/files/tree", async () => {
  const projectRoot = requireProjectRoot();
  return buildFileTree(projectRoot);
});

app.get("/api/files/content", async (request) => {
  const projectRoot = requireProjectRoot();
  const query = z.object({ path: z.string().min(1) }).parse(request.query);
  const filePath = ensureWithinRoot(projectRoot, query.path);
  const kind = detectFileKind(filePath);
  if (kind === "function") {
    const raw = await readFile(filePath, "utf8");
    return {
      path: filePath,
      filePath,
      raw,
      errors: [],
      kind
    };
  }

  return {
    filePath,
    kind,
    ...(await readJsonFile(filePath))
  };
});

app.put("/api/files/content", async (request) => {
  const projectRoot = requireProjectRoot();
  const body = z.object({ path: z.string().min(1), content: z.string(), format: z.boolean().optional() }).parse(request.body);
  const filePath = ensureWithinRoot(projectRoot, body.path);
  const content = body.format ? formatJsonDocument(body.content) : body.content;
  await writeFile(filePath, content, "utf8");
  await refreshProject("fileSaved", { filePath: relativeUnixPath(projectRoot, filePath) });
  return { ok: true };
});

app.post("/api/index/rebuild", async () => {
  requireProjectRoot();
  await refreshProject("indexUpdated");
  return { ok: true, summary: summarizeIndex(state.projectIndex) };
});

app.get("/api/index/summary", async () => summarizeIndex(state.projectIndex));

app.post("/api/validate/file", async (request) => {
  const projectRoot = requireProjectRoot();
  const body = z.object({ path: z.string().min(1) }).parse(request.body);
  const filePath = ensureWithinRoot(projectRoot, body.path);
  return validateFile(filePath, requireValidationContext());
});

app.post("/api/validate/project", async () => {
  requireProjectRoot();
  state.diagnostics = await validateProject(requireValidationContext());
  return state.diagnostics;
});

app.get("/api/problems", async () => state.diagnostics);

app.get("/api/schemas/types", async (request) => {
  const query = z.object({ kind: z.string().optional() }).parse(request.query);
  if (!query.kind) {
    return getSchemaKinds(state.schemaRegistry).map((kind) => ({
      kind,
      count: getTypesForKind(state.schemaRegistry, kind).length
    }));
  }
  return getTypesForKind(state.schemaRegistry, query.kind);
});

app.get("/api/schemas/type", async (request) => {
  const query = z.object({ kind: z.string(), type: z.string() }).parse(request.query);
  return getTypeDefinition(state.schemaRegistry, query.kind, query.type) ?? null;
});

app.get("/api/references/power", async (request) => {
  const query = z.object({ id: z.string() }).parse(request.query);
  return getReferencesTo(requireIndex(), query.id);
});

app.get("/api/references/item_modifier", async (request) => {
  const query = z.object({ id: z.string() }).parse(request.query);
  return getReferencesTo(requireIndex(), query.id);
});

app.get("/api/references/tag", async (request) => {
  const query = z.object({ id: z.string() }).parse(request.query);
  return getReferencesTo(requireIndex(), query.id);
});

app.get("/api/profiles", async () => ({
  available: listProfiles(),
  active: state.profile.profile,
  config: state.profile
}));

app.post("/api/profiles/select", async (request) => {
  const body = z.object({ profile: z.string() }).parse(request.body);
  if (body.profile !== "default") {
    return { ok: false, message: "Only the default profile is available in the MVP." };
  }
  state.profile = await loadProfile(state.projectRoot);
  broadcast("activeProfileChanged", { profile: state.profile.profile });
  return { ok: true, active: state.profile.profile };
});

app.get("/ws", { websocket: true }, (connection) => {
  const socket = connection.socket as LiveSocket;
  sockets.add(socket);
  socket.send(JSON.stringify({ event: "connected", payload: { hasProject: Boolean(state.projectRoot) } }));
  socket.on("close", () => sockets.delete(socket));
});

async function openProject(projectRoot: string): Promise<void> {
  const rootStat = await stat(projectRoot);
  if (!rootStat.isDirectory()) throw new Error("Project path must be a directory.");

  state.projectRoot = projectRoot;
  state.profile = await loadProfile(projectRoot);
  await refreshProject("projectOpened", { projectRoot });

  await state.watcher?.close();
  state.watcher = chokidar.watch(projectRoot, {
    ignoreInitial: true,
    ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**"]
  });

  state.watcher.on("add", (filePath) => void onExternalChange(filePath));
  state.watcher.on("change", (filePath) => void onExternalChange(filePath));
  state.watcher.on("unlink", (filePath) => void onExternalChange(filePath));
}

async function onExternalChange(filePath: string): Promise<void> {
  if (!state.projectRoot) return;
  await refreshProject("fileChanged", { filePath: relativeUnixPath(state.projectRoot, filePath) });
}

async function refreshProject(event: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (!state.projectRoot) return;
  state.projectIndex = await indexProject(state.projectRoot);
  state.schemaRegistry = await loadSchemaRegistry(schemaDir);
  state.diagnostics = await validateProject(requireValidationContext());
  broadcast("indexUpdated", summarizeIndex(state.projectIndex));
  broadcast("diagnosticsUpdated", state.diagnostics);
  broadcast("schemaUpdated", { version: state.schemaRegistry.version });
  broadcast(event, payload);
}

function summarizeIndex(index?: ProjectIndex): Record<string, unknown> {
  if (!index) return { projectRoot: state.projectRoot, counts: {} };
  const counts = index.entries.reduce<Record<string, number>>((accumulator, entry: ProjectIndex["entries"][number]) => {
    accumulator[entry.kind] = (accumulator[entry.kind] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    projectRoot: index.projectRoot,
    namespaces: index.namespaces,
    counts
  };
}

function requireProjectRoot(): string {
  if (!state.projectRoot) throw new Error("No project is currently open.");
  return state.projectRoot;
}

function requireIndex(): ProjectIndex {
  if (!state.projectIndex) throw new Error("Project index is not ready.");
  return state.projectIndex;
}

function requireValidationContext() {
  return {
    index: requireIndex(),
    registry: state.schemaRegistry
  };
}

function broadcast(event: string, payload: unknown): void {
  const message = JSON.stringify({ event, payload });
  for (const socket of sockets) {
    socket.send(message);
  }
}

async function buildFileTree(root: string, current = root): Promise<Array<Record<string, unknown>>> {
  const entries = await readdir(current, { withFileTypes: true });
  const relevant = entries.filter((entry) => !["node_modules", ".git", "dist"].includes(entry.name));

  return Promise.all(
    relevant
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
      .map(async (entry) => {
        const fullPath = path.join(current, entry.name);
        const relativePath = relativeUnixPath(root, fullPath);
        return entry.isDirectory()
          ? {
              name: entry.name,
              path: fullPath,
              relativePath,
              type: "directory",
              children: await buildFileTree(root, fullPath)
            }
          : {
              name: entry.name,
              path: fullPath,
              relativePath,
              type: "file",
              kind: detectFileKind(fullPath)
            };
      })
  );
}

app.listen({ host, port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
