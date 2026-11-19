# json-delta

[![CI](https://github.com/saizul/json-delta/actions/workflows/ci.yml/badge.svg)](https://github.com/saizul/json-delta/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/saizul/json-delta?sort=semver)](https://github.com/saizul/json-delta/releases)
[![GitHub Packages](https://img.shields.io/badge/npm-%40saizul%2Fjson--delta-blue?logo=npm)](https://github.com/saizul/json-delta/pkgs/npm/json-delta)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![TypeScript](https://img.shields.io/badge/types-included-blue)

See exactly what changed between two JSON documents, as a readable list or a
standard RFC 6902 JSON Patch you can send, store and apply.

- **Diff** any two JSON values into a minimal [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902)
  JSON Patch. Arrays are compared with a longest common subsequence, so an
  insert is one `add`, not a cascade of replaces.
- **Track items by id.** Pass `objectHash: 'id'` and reordered items become
  `move` operations, while changed items are patched in place.
- **Apply** JSON Patches with every RFC 6902 rule, including `test`, `move`,
  `copy`, `-` and atomic failure. All 16 examples from the RFC's appendix
  are in the test suite.
- **Merge patches** ([RFC 7386](https://www.rfc-editor.org/rfc/rfc7386)):
  create and apply them.
- **JSON Pointer** ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901))
  helpers with correct `~0`/`~1` escaping.
- **A CLI for humans and CI**: colored output, `--patch`, `--merge`,
  `--summary`, and exit code 1 when the files differ.

Zero runtime dependencies. ESM, CommonJS and type declarations included.
Safe with untrusted input: `__proto__` is an ordinary key, never a prototype.

```console
$ json-delta before.json after.json --object-hash id
~ /version: "1.4.0" -> "1.5.0"
- /features/beta: true
+ /features/export: true
> /users/0 -> /users/2 {"id":1,"name":"Ada","role":"admin"}
+ /users/3: {"id":4,"name":"Barbara","role":"dev"}
~ /users/1/role: "dev" -> "admin"
$ echo $?
1
```

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [CLI](#cli)
- [API reference](#api-reference)
- [How arrays are compared](#how-arrays-are-compared)
- [Errors](#errors)
- [Examples](#examples)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Install

The package is published to GitHub Packages as `@saizul/json-delta`. Tell npm
where the `@saizul` scope lives (once per project or in `~/.npmrc`):

```console
$ echo "@saizul:registry=https://npm.pkg.github.com" >> .npmrc
$ npm install @saizul/json-delta
```

GitHub Packages needs a token with `read:packages` even for public packages;
see [Authenticating to GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).

Node 20 or newer for the CLI. The library uses no Node APIs and runs in
browsers, Deno, Bun and edge runtimes.

## Quick start

### Library

```ts
import { applyPatch, createMergePatch, diff } from '@saizul/json-delta';

const before = { version: '1.4.0', users: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }] };
const after = { version: '1.5.0', users: [{ id: 2, name: 'Linus' }, { id: 1, name: 'Ada Lovelace' }] };

const patch = diff(before, after, { objectHash: 'id' });
// [
//   { op: 'replace', path: '/version', value: '1.5.0' },
//   { op: 'move', from: '/users/0', path: '/users/1' },
//   { op: 'replace', path: '/users/1/name', value: 'Ada Lovelace' }
// ]

applyPatch(before, patch); // deep-equals `after`; `before` is not changed

createMergePatch({ a: 1, b: 2 }, { a: 1, c: 3 });
// { b: null, c: 3 }
```

CommonJS works the same way:

```js
const { diff, applyPatch } = require('@saizul/json-delta');
```

### CLI

```console
$ npx @saizul/json-delta before.json after.json --summary -k id
6 changes: 2 added, 1 removed, 2 changed, 1 moved
  /version
  /features/beta
  /features/export
  /users/2
  /users/3
  /users/1/role
```

## CLI

```text
Usage: json-delta [options] <a.json> <b.json>
       json-delta apply [options] <document.json> <patch.json>

Output (pick one; default is a readable, colored list of changes):
  -p, --patch            print an RFC 6902 JSON Patch
  -m, --merge            print an RFC 7386 JSON Merge Patch
  -s, --summary          print counts per kind of change and the changed paths
  -q, --quiet            print nothing; only set the exit code

Diff options:
  -k, --object-hash <key>  match array items by this property (e.g. id) and
                           report moved items as "move" operations
      --invertible       add a "test" before every remove and replace
      --indent <N>       indentation of JSON output (default 2, 0 for one line)
      --color, --no-color  force colors on or off (default: on for a
                           terminal unless NO_COLOR is set)

  -h, --help             show this help
  -v, --version          show the version
```

The readable format has one line per change:

| Prefix | Meaning | Color |
| --- | --- | --- |
| `+ /path: value` | added | green |
| `- /path: old` | removed | red |
| `~ /path: old -> new` | changed | yellow |
| `> /from -> /path value` | moved (with `--object-hash`) | cyan |

Paths are JSON Pointers and are applied in order, exactly like the patch, so
array indices refer to the array as it is at that step.

`json-delta apply` applies a JSON Patch (a JSON array) or a merge patch (a
JSON object) and prints the result. Use `-` for either file to read stdin.

| Exit code | `json-delta a b` | `json-delta apply` |
| --- | --- | --- |
| 0 | no differences | patch applied |
| 1 | the files differ | the patch failed (`test` mismatch, missing path) |
| 2 | usage error, unreadable file or invalid JSON | the same, or a malformed patch |

### In CI

Fail a build when a generated file drifts from the committed one:

```yaml
- run: npm run build:schema
- run: npx @saizul/json-delta schema.committed.json dist/schema.json
```

Check an API response against a snapshot, ignoring key order:

```console
$ curl -s https://api.example.com/health | json-delta test/health.snapshot.json -
```

## API reference

All functions are pure: they never change their arguments unless you ask for
it with `{ mutate: true }`. Every value must be plain JSON; anything else
(`undefined`, `NaN`, `Date`, `Map`, functions) throws `NOT_JSON`.

### `diff(a, b, options?)`

Returns a `JsonPatch` (an array of operations) that turns `a` into `b`.
`applyPatch(a, diff(a, b))` always deep-equals `b`. Returns `[]` for equal
values (object key order is ignored).

| Option | Default | Meaning |
| --- | --- | --- |
| `objectHash` | none | A property name such as `'id'`, or `(item, index) => string \| number \| undefined`. Array items with the same identity are matched, patched in place, and reported as `move` when they change position. Items without an identity are matched by value. |
| `invertible` | `false` | Put a `test` with the old value before every `remove` and `replace`, so the patch fails on a document that changed in the meantime. |
| `maxLcsCells` | `4000000` | Arrays whose lengths multiply to more than this are compared position by position, to bound time and memory. |

### `changes(a, b, options?)`

The same changes as `diff()` with the old values attached:
`{ op: 'replace', path, value, oldValue }`, `{ op: 'remove', path, oldValue }`,
`{ op: 'add', path, value }` and `{ op: 'move', from, path, value }`. Use it
to build your own UI.

### `formatChanges(changes, { color?, maxValueLength? })`

Renders `changes()` in the CLI's one-line-per-change format. Values longer
than `maxValueLength` (default 80) are shortened. Control characters are
escaped, so the output is safe to print.

### `summarize(patchOrChanges)`

Counts operations by kind: `{ add, remove, replace, move, copy, test, total, paths }`.
`total` excludes `test`; `paths` lists the changed paths once each.

### `applyPatch(document, patch, { mutate? })`

Applies an RFC 6902 patch and returns the result. Without `mutate` the input
is copied first, so a failing patch leaves it untouched (atomic). With
`mutate: true` it is changed in place, which is faster for large documents.
Members the RFC does not define (such as `"xyz": 123`) are ignored.

### `applyOperation(document, operation, index?)`

Applies one operation in place and returns the document (a new value only
when the root is replaced). `index` is used in error messages.

### `validatePatch(patch)`

Checks that `patch` is an array of well-formed operations without applying
it. Useful for rejecting bad input at an API boundary.

### `applyMergePatch(target, patch)` and `createMergePatch(a, b)`

RFC 7386 merge patches: objects are merged, `null` removes a member and any
other value (arrays included) replaces. `createMergePatch` throws
`MERGE_NULL` when `b` sets a member to `null`, because a merge patch cannot
express that; use `diff()` for such documents.

### JSON Pointer

| Function | Example |
| --- | --- |
| `parsePointer(pointer)` | `parsePointer('/a~1b/0')` → `['a/b', '0']` |
| `formatPointer(tokens)` | `formatPointer(['a/b', 0])` → `'/a~1b/0'` |
| `appendPointer(pointer, token)` | `appendPointer('/a', 'm~n')` → `'/a/m~0n'` |
| `escapeToken(token)` / `unescapeToken(token)` | `'~1'` ↔ `'~01'` |
| `getValue(document, pointer)` | the value, or `undefined` when missing |
| `hasValue(document, pointer)` | `true` when the pointer resolves (a `null` value counts) |
| `parseIndex(token)` | `'12'` → `12`; `'01'`, `'-'` and `'1.5'` → `undefined` |
| `isPointerPrefix(parent, pointer)` | `('/a', '/a/b')` → `true`, `('/a', '/ab')` → `false` |

### Helpers

- `deepEqual(a, b)`: JSON equality; object key order does not matter.
- `clone(value)`: a deep copy.
- `canonical(value)`: JSON text with sorted keys, handy as a cache key.
- `JsonDeltaError`: the error class (see below).
- `VERSION`: the package version.

Types: `JsonValue`, `JsonObject`, `JsonPatch`, `Operation` and one type per
operation (`AddOperation`, ...), `Change`, `DiffOptions`, `ApplyOptions`,
`ObjectHash`, `Summary`, `FormatOptions`, `ErrorCode`.

## How arrays are compared

Without `objectHash`, json-delta finds the longest common subsequence of the
two arrays (by value) and only touches what is not in it. Removed and added
items at the same spot are paired, and paired objects are diffed
recursively, so `[{ "name": "a", "n": 1 }]` → `[{ "name": "a", "n": 2 }]` is
`replace /0/n`, not a whole new item.

```text
[a, b, c, d, e, f]  ->  [b, c, x, e, f, g]

remove /0         [b, c, d, e, f]
replace /2 "x"    [b, c, x, e, f]
add /5 "g"        [b, c, x, e, f, g]
```

With `objectHash`, items are matched by identity instead. Items that were
removed are removed first (from the end), then the target order is built
left to right: items on the longest common subsequence of identities stay,
the rest are added or moved next to their new neighbour, and finally items
that kept their identity but changed are patched at their new index. A
reorder of one item is one `move`.

Comparing two arrays is O(n × m) in time and memory after common prefixes
and suffixes are skipped. Above `maxLcsCells` (two arrays of about 2,000
changed items each) json-delta compares by position instead; the patch is
still correct, just larger.

## Errors

Everything throws `JsonDeltaError` with a stable `code`, plus `path` (the
JSON Pointer involved) and `operationIndex` (which operation failed) when
they apply.

| Code | When |
| --- | --- |
| `INVALID_POINTER` | A pointer does not start with `/` or has `~` not followed by `0` or `1` |
| `INVALID_PATCH` | The patch is not an array |
| `INVALID_OPERATION` | Unknown `op`, missing `path`/`from`/`value`, a non-JSON value, or removing the root |
| `PATH_NOT_FOUND` | The target (or its parent) does not exist |
| `INVALID_INDEX` | An array index that is out of range, has a leading zero, or is `-` where it is not allowed |
| `TEST_FAILED` | A `test` operation did not match |
| `MOVE_INTO_CHILD` | A `move` whose `path` is inside its `from` |
| `NOT_JSON` | An input is not plain JSON (`undefined`, `NaN`, `Date`, ...) |
| `MERGE_NULL` | `createMergePatch` cannot express setting a member to `null` |

```ts
import { applyPatch, JsonDeltaError } from '@saizul/json-delta';

try {
  applyPatch(doc, patch);
} catch (err) {
  if (err instanceof JsonDeltaError && err.code === 'TEST_FAILED') {
    // someone else changed the document: reload and retry
  }
}
```

## Examples

The [`examples/`](examples) folder has runnable scripts (run `npm run build`
first):

- [`basic.mjs`](examples/basic.mjs): diff, format, apply and merge patch.
- [`commonjs.cjs`](examples/commonjs.cjs): `require()` usage.
- [`optimistic-update.mjs`](examples/optimistic-update.mjs): send a patch
  guarded by `test` operations and detect a concurrent edit.
- [`before.json`](examples/before.json) and [`after.json`](examples/after.json):
  try the CLI on them.

## FAQ

**Why are the paths in the readable output sometimes "off by one"?**
They are the exact paths of the patch, applied in order. After
`- /users/0`, the item that was at index 1 is at index 0. This is what
makes the output a faithful description of the patch.

**JSON Patch or merge patch?**
A merge patch is a partial document and easy to read, but it cannot set a
value to `null` and replaces arrays as a whole. A JSON Patch is precise,
can be guarded with `test`, and edits arrays item by item. Use merge patches
for simple config overrides and HTTP `PATCH` with
`application/merge-patch+json`; use JSON Patch for everything else.

**Is the diff minimal?**
For objects, yes. For arrays it is minimal in the number of items kept
(longest common subsequence), which is what people expect in practice; it
does not search all possible move combinations.

**Does it work with huge files?**
The CLI reads both files into memory. Arrays are bounded by `maxLcsCells`.
Documents of tens of megabytes are fine; streaming is not supported.

**Why does `diff` throw on `undefined` values?**
`undefined` is not JSON, and `JSON.stringify` silently drops it, which
would make a patch disagree with what is sent over the wire. Remove those
keys or convert them to `null` first.

**How do I compare while ignoring some fields?**
Delete them from both sides before calling `diff()` (or pipe through `jq
'del(.updatedAt)'` for the CLI). A built-in `--ignore` option is on the
roadmap.

## Roadmap

Ideas, many of them marked "good first issue":

- `--ignore <pointer>` to skip volatile fields like timestamps (good first issue)
- `--json` output for `--summary` (good first issue)
- `invertPatch()` to undo a patch created with `invertible: true` (good first issue)
- A side-by-side `--format=tree` view for the CLI
- Detect moves without `objectHash` when an equal value appears elsewhere
- Optional `copy` detection for duplicated subtrees
- YAML input for the CLI via an optional peer dependency
- `--fail-on add,remove` to choose which kinds of change fail CI

## Contributing

Bug reports, new test cases from other JSON Patch implementations and docs
fixes are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup,
the checks CI runs and a list of beginner-friendly issues. Please follow the
[code of conduct](CODE_OF_CONDUCT.md). Security problems: see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Saizul Amin
