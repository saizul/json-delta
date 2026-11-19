# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
private vulnerability reporting ("Report a vulnerability" under the
repository's **Security** tab). You will get an answer within a week.

## Scope

json-delta is often used on untrusted input: patches sent to an API,
documents uploaded by users, files in pull requests. Reports in these areas
are especially welcome:

- **Prototype pollution.** Any document, patch or merge patch that changes
  `Object.prototype` or the prototype of a result. `__proto__`,
  `constructor` and `prototype` must behave as ordinary keys.
- **Denial of service.** Inputs that make `diff()`, `applyPatch()` or the
  merge functions take far longer than their size suggests or use unbounded
  memory. Array comparison is bounded by `maxLcsCells`; a way around it is a
  bug.
- **Atomicity.** A patch that fails but still changes the input document
  when `mutate` is not set.
- **Output injection.** The CLI prints keys and values from the input. If a
  document can make it print raw terminal escape sequences, please report it.

## What json-delta is not

It does not authorize patches. Applying a client's JSON Patch to a server
document lets the client change any path; check the paths (for example with
`validatePatch()` and an allowlist) before applying patches from users.
