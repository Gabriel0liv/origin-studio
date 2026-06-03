# Schemas

## Goal

Origin Studio is designed to consume schema information from `mathgeniuszach/origin-creator-schemas` without assuming that repository is pure JSON Schema.

The adapter layer converts source YAML into an internal normalized shape:

- `NormalizedTypeDefinition`
- `NormalizedField`

## Normalized Model

### `NormalizedTypeDefinition`

- `id`
- `kind`
- `description`
- `fields`
- `examples`
- `aliases`
- `deprecated`
- `source`

### `NormalizedField`

- `name`
- `type`
- `required`
- `description`
- `defaultValue`
- `allowedValues`
- `nestedKind`
- `arrayItemType`
- `warnings`

## Registry Loading

The adapter currently supports two modes:

1. Local schema cache in `schemas/origin-creator-schemas`
2. Builtin fallback registry for common MVP types

If no YAML files are present, the builtin registry is used so the editor and validator still work offline.

## Current MVP Coverage

Builtin registry includes starter coverage for:

- power types
- entity actions
- bientity actions
- conditions
- item conditions
- damage conditions

This is enough to support the initial visual editor and the first validation layer, while leaving room for broader schema fidelity later.

## Sync Command

`origin-studio schemas sync` uses `git` to clone or pull the schema repository into the local cache directory.

It also stores a simple version file:

```text
schemas/origin-creator-schemas/.origin-studio-version.json
```

## Future Work

- deeper normalization of nested field semantics
- explicit JSON Schema projection for AJV where possible
- richer docs links and examples
- version-aware schema compatibility
- schema diffing between local cache and builtin registry
