# Architecture

## Overview

Origin Studio is split into a local server, a browser UI, and shared packages:

- `apps/server`: opens projects, reads/writes files, watches the filesystem, rebuilds the index, validates files, and pushes updates over WebSocket.
- `apps/web`: start screen, explorer, Monaco editor, visual editor shell, diagnostics, schema view, and reference view.
- `packages/core`: path logic, JSON/JSONC parsing, file-kind detection, safe editing helpers, and shared types.
- `packages/origin-creator-adapter`: schema normalization and builtin schema fallback.
- `packages/project-indexer`: generic datapack scanning and reference extraction.
- `packages/validator`: registry-backed validation and custom Origins/Apoli diagnostics.
- `packages/profiles`: optional project profile loading and templates.
- `packages/cli`: headless commands for validation, indexing, schema sync, and diagnostics explanation.

## Data Flow

1. The user opens a datapack folder.
2. The server indexes known datapack files.
3. The validator produces diagnostics from the index and schemas.
4. The web UI requests file trees, content, diagnostics, and schemas via HTTP.
5. `chokidar` watches the project folder for external edits.
6. On change, the server rebuilds index + diagnostics and emits WebSocket events.
7. The web UI refreshes the selected file and problem list.

## Source of Truth

The local disk is the only source of truth.

- The editor reads directly from project files.
- Save writes back to the same file.
- External edits are reloaded into the UI.
- No import/export intermediary is required.

## Security Model

- Fastify binds to `127.0.0.1`.
- File writes are normalized and checked against the currently opened project root.
- Path traversal outside the project root is rejected.

## Package Boundaries

## `packages/core`

- Pure helpers with no UI coupling.
- Shared types for diagnostics, indexing, and JSON documents.

## `packages/project-indexer`

- Generic file discovery for:
  - `data/*/powers/**/*.json`
  - `data/*/origins/**/*.json`
  - `data/*/origin_layers/**/*.json`
  - `data/*/origins_layers/**/*.json`
  - `data/*/item_modifiers/**/*.json`
  - `data/*/tags/**/*.json`
  - `data/*/damage_type/**/*.json`
  - `data/*/functions/**/*.mcfunction`

## `packages/validator`

- Parse validation
- Type registry validation
- Rule-based domain diagnostics
- Reference checks against the in-memory project index

## `apps/server`

Core endpoints:

- `GET /api/health`
- `GET /api/project`
- `POST /api/project/open`
- `GET /api/files/tree`
- `GET /api/files/content`
- `PUT /api/files/content`
- `POST /api/index/rebuild`
- `GET /api/index/summary`
- `POST /api/validate/file`
- `POST /api/validate/project`
- `GET /api/problems`
- `GET /api/schemas/types`
- `GET /api/schemas/type`
- `GET /api/references/power`
- `GET /api/references/item_modifier`
- `GET /api/references/tag`
- `GET /api/profiles`
- `POST /api/profiles/select`

WebSocket events:

- `projectOpened`
- `fileChanged`
- `fileSaved`
- `diagnosticsUpdated`
- `indexUpdated`
- `schemaUpdated`
- `activeProfileChanged`

## `apps/web`

Main surfaces:

- Start screen
- Project explorer
- JSON editor
- Visual editor shell
- Problems panel
- Reference inspector
- Raw schema panel
