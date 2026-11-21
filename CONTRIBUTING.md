# Contributing

Thanks for helping improve json-delta. Bug reports with small failing
documents, test cases borrowed from other JSON Patch implementations, new CLI
options and documentation fixes are all welcome. If you are new to open
source, start with one of the [beginner issues](#good-first-issues) below;
each is small and lists the files involved.

## Reporting a bug

Open an issue with:

- the two documents (or the document and the patch), as small as possible
- the options you used (`objectHash`, `invertible`, CLI flags)
- what you got and what you expected
- your json-delta and Node versions (`node --version`)

## Development setup

You need Node 20 or newer.

```console
$ git clone https://github.com/saizul/json-delta.git
$ cd json-delta
$ npm ci
$ npm test              # builds ESM + CJS, compiles the tests and runs node:test
$ npm run lint          # biome lint + tsc --noEmit
$ npm run format        # biome format --write
$ npm run format:check  # what CI runs
```

Try the CLI from the build:

```console
$ node dist/esm/cli.js examples/before.json examples/after.json -k id
```

## Guidelines

- **Zero runtime dependencies.** Development tools go in `devDependencies`.
- **The library must not need Node.** Only `src/cli.ts` and `src/cli/` may
  use Node APIs.
- **Round trips are the contract.** `applyPatch(a, diff(a, b))` must equal
  `b` for every input. `test/fuzz.test.ts` checks this on thousands of
  random pairs; if you change `diff()`, run it a few times with other seeds.
- **Follow the RFCs.** When behaviour is unclear, quote the section of
  RFC 6902, 6901 or 7386 in the pull request.
- **Error codes are public API.** Do not rename them outside a major release.
- Every change comes with a test and a line in the `Unreleased` section of
  `CHANGELOG.md`.

## Project layout

```text
src/
  diff.ts          diff() and changes(): objects, LCS arrays, objectHash moves
  apply.ts         applyPatch(), applyOperation(), validatePatch()
  merge.ts         RFC 7386 applyMergePatch() and createMergePatch()
  pointer.ts       RFC 6901 JSON Pointer helpers
  value.ts         deepEqual(), clone(), canonical(), safe key access
  format.ts        formatChanges() for the readable output
  summary.ts       summarize()
  errors.ts        JsonDeltaError and codes
  cli.ts, cli/     command-line interface
test/              node:test suites, RFC examples and the fuzz test
examples/          runnable ESM and CommonJS examples and sample files
```

## Good first issues

These are deliberately small. Each one lists where to start.

1. **`--ignore <pointer>`**: skip paths such as `/updatedAt` in both
   documents before comparing. Parse the flag in `src/cli/run.ts`, remove
   the paths with `applyOperation` (ignoring `PATH_NOT_FOUND`), and add
   tests in `test/cli.test.ts`.
2. **`--summary --json`**: print `summarize()` as JSON. A few lines in
   `src/cli/run.ts` plus a test.
3. **Show the old value of moves in the summary**: today `--summary` lists
   only the target path of a `move`; print `/from -> /path`. See the
   `summary` case in `src/cli/run.ts`.
4. **More conformance tests**: port cases from the community
   `json-patch-tests` suite (`tests.json`) into a new
   `test/conformance.test.ts`, written as data with a short loop.
5. **`--fail-on <kinds>`**: exit 1 only for some kinds of change, e.g.
   `--fail-on remove,replace` to allow additions in CI. Use
   `summarize()` in `src/cli/run.ts`.
6. **A `diff` example for React state**: add `examples/undo-stack.mjs`
   that records `diff()` patches as an undo history and replays them.
7. **Truncation option for the CLI**: expose `maxValueLength` from
   `formatChanges()` as `--max-width <N>`.

## Pull requests

Keep them focused: one fix or feature per pull request. Describe what
changed and how you tested it; the template has a short checklist. CI runs
lint, format check and the tests on Node 20 and 22 on Linux, and Node 22 on
Windows and macOS.
