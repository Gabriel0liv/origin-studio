# Diagnostics

## Format

Diagnostics follow this shape:

```ts
{
  id: string,
  severity: "error" | "warning" | "info",
  filePath: string,
  range?: {
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  },
  message: string,
  suggestion?: string,
  docsUrl?: string,
  quickFix?: QuickFix
}
```

## MVP Rules

Errors:

- invalid JSON/JSONC
- unknown `type`
- missing required field
- missing power reference
- missing item modifier reference
- missing tag reference
- missing resource reference
- invalid `origins:inverted`
- `origins:action_on_hit` with direct `chance`
- `origins:action_on_hit` with direct `condition`

Warnings:

- unsupported field for known type
- `origins:active_self` with direct cooldown in a likely conditional branch
- `origins:execute_command` where a native action may exist
- `interval < 20`

Info:

- `origins:multiple` used when the file shape suggests it may be unnecessary

## Philosophy

- Diagnostics should help without blocking save.
- Incomplete datapacks are accepted during editing.
- Unknown fields are preserved.
- Some rules are heuristic by design and intentionally use warning/info severity instead of error.

## Explainability

The CLI provides:

```bash
origin-studio explain <diagnostic-id>
```

The web UI also includes an `Explain` action for selected diagnostics.

## Planned Extensions

- project profile controlled enable/disable flags
- richer quick fixes
- direct schema docs URLs
- better nested range mapping from JSONC AST
- cross-file reference graph diagnostics
