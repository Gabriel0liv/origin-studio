# Origin Studio

Origin Studio is a local-first web tool for creating, editing, viewing, indexing, and validating Origins/Apoli datapacks directly from the real files on disk.

The source of truth is always the local project folder. There is no export/import loop, no editor lock-in, and no project-specific hardcoding.

## MVP Scope

- Open a local datapack folder.
- Read and save real files on disk.
- Watch external edits with `chokidar`.
- Index common Origins/Apoli datapack files.
- Validate parse errors, known type mistakes, and missing references.
- Inspect and edit JSON with Monaco.
- Show a visual editor for common top-level fields while preserving unknown fields.

## Stack

- `pnpm` workspaces
- TypeScript
- `apps/web`: React + Vite
- `apps/server`: Node.js + Fastify + WebSocket
- `packages/*` shared domain logic
- `jsonc-parser`, `yaml`, `AJV`, `chokidar`, `Monaco Editor`
- Tailwind CSS + Radix UI primitives

## Workspace Layout

```text
origin-studio/
├─ apps/
│  ├─ server/
│  └─ web/
├─ packages/
│  ├─ cli/
│  ├─ core/
│  ├─ origin-creator-adapter/
│  ├─ profiles/
│  ├─ project-indexer/
│  └─ validator/
├─ schemas/
│  └─ origin-creator-schemas/
└─ docs/
```

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

The Fastify server runs locally on `127.0.0.1:8787`.

## Open a Project

From the UI:

1. Start `pnpm dev`.
2. Open `http://localhost:5173`.
3. Enter the local datapack folder path.
4. Click `Open Project`.

From the CLI:

```bash
pnpm --filter @origin-studio/cli origin-studio open "C:/Users/User/Desktop/MyOriginsDatapack"
```

## Validate

Validate a whole datapack:

```bash
pnpm --filter @origin-studio/cli origin-studio validate ./MyDatapack
```

Validate one file:

```bash
pnpm --filter @origin-studio/cli origin-studio validate-file ./MyDatapack/data/example/powers/test.json
```

Example output:

```text
ERROR data/example/powers/test.json
[action-on-hit-invalid-chance]
origins:action_on_hit nao aceita `chance` diretamente. Use `bientity_condition` com `origins:chance`.
```

## Schemas

Sync the Origin Creator schema cache:

```bash
pnpm --filter @origin-studio/cli origin-studio schemas sync
```

Check schema cache status:

```bash
pnpm --filter @origin-studio/cli origin-studio schemas status
```

If the local cache is missing and network sync cannot run, the MVP falls back to a builtin registry for common types.

## Current MVP Status

Implemented:

- Monorepo structure and package boundaries
- File indexing for common Origins/Apoli paths
- Fastify server with file APIs and WebSocket updates
- Local-first JSON editing and save flow
- Basic diagnostics for:
  - invalid JSON/JSONC
  - unknown `type`
  - missing required fields
  - unsupported fields
  - invalid `origins:inverted`
  - invalid `action_on_hit` top-level `chance`
  - invalid `action_on_hit` top-level `condition`
  - missing power references
  - missing item modifier references
  - missing tag references
  - missing resource references
  - low `interval`
- Visual editor shell for common fields and unknown-field preservation

Still limited in the MVP:

- The schema-driven visual editor is still shallow for nested action/condition trees.
- AJV is included in the stack, but the current validator is primarily registry/rule-based.
- Profile management is bootstrapped around `default`.
- Schema sync depends on local `git` access.

## Notes

- The app is generic to any Origins/Apoli datapack layout that follows standard datapack conventions.
- The server only binds to localhost.
- Writes are restricted to the opened project root.
- Unknown fields are preserved instead of stripped.

More detail:

- [Architecture](./docs/architecture.md)
- [Schemas](./docs/schemas.md)
- [Diagnostics](./docs/diagnostics.md)
