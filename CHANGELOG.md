# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `invertPatch(patch, original?)` returns the patch that undoes `patch`.
  Patches made with `invertible: true` are inverted from their `test`
  operations alone; with the original document any valid patch can be
  inverted, including `copy`, `-` appends and `add` over an existing member.
  The inverse carries its own `test` operations, so it is invertible too.

## [0.1.0] - 2026-11-19

### Added

- `diff()` producing RFC 6902 JSON Patch, with longest-common-subsequence
  array comparison, recursive patching of changed array items, an
  `objectHash` option (property name or function) that turns reorders into
  `move` operations, an `invertible` option that adds `test` operations and
  a `maxLcsCells` bound.
- `changes()` with old values, `formatChanges()` and `summarize()`.
- `applyPatch()`, `applyOperation()` and `validatePatch()` implementing all
  of RFC 6902, atomic by default, with `{ mutate: true }` for in-place use.
- `applyMergePatch()` and `createMergePatch()` for RFC 7386.
- JSON Pointer helpers for RFC 6901: `parsePointer()`, `formatPointer()`,
  `appendPointer()`, `escapeToken()`, `unescapeToken()`, `getValue()`,
  `hasValue()`, `parseIndex()` and `isPointerPrefix()`.
- `deepEqual()`, `clone()` and `canonical()`.
- `JsonDeltaError` with stable error codes.
- The `json-delta` CLI: colored readable diff, `--patch`, `--merge`,
  `--summary`, `--quiet`, `--object-hash`, `--invertible`, `--indent`,
  stdin with `-`, exit code 1 on differences, and `json-delta apply`.
- ESM and CommonJS builds with type declarations; no runtime dependencies.

[Unreleased]: https://github.com/saizul/json-delta/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saizul/json-delta/releases/tag/v0.1.0
