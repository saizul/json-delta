import { JsonDeltaError } from './errors.js';
import { appendPointer } from './pointer.js';
import type { JsonObject, JsonValue } from './types.js';
import { assertJson, clone, deepEqual, hasKey, isObject, setKey } from './value.js';

/**
 * Applies an RFC 7386 JSON Merge Patch. Members set to `null` are removed,
 * objects are merged recursively and everything else (including arrays)
 * replaces the old value. The input is not changed.
 */
export function applyMergePatch<T = JsonValue>(target: JsonValue, patch: JsonValue): T {
  assertJson(target);
  assertJson(patch);
  return merge(target, patch) as T;
}

function merge(target: JsonValue | undefined, patch: JsonValue): JsonValue {
  if (!isObject(patch)) return clone(patch);
  const out: JsonObject = isObject(target) ? clone(target) : {};
  for (const key of Object.keys(patch)) {
    const value = patch[key]!;
    if (value === null) delete out[key];
    else setKey(out, key, merge(hasKey(out, key) ? out[key] : undefined, value));
  }
  return out;
}

/**
 * Creates an RFC 7386 JSON Merge Patch that turns `a` into `b`. Returns `{}`
 * when both are equal objects.
 *
 * A merge patch cannot set a member to `null` (null means "remove"), so this
 * throws `MERGE_NULL` when `b` has a `null` member that is new or changed.
 * Use `diff()` for those documents.
 */
export function createMergePatch(a: JsonValue, b: JsonValue): JsonValue {
  assertJson(a);
  assertJson(b);
  return create(a, b, '');
}

function create(a: JsonValue, b: JsonValue, path: string): JsonValue {
  if (!isObject(a) || !isObject(b)) {
    checkNoNull(b, path);
    return clone(b);
  }
  const patch: JsonObject = {};
  for (const key of Object.keys(a)) {
    if (!hasKey(b, key)) setKey(patch, key, null);
  }
  for (const key of Object.keys(b)) {
    const child = appendPointer(path, key);
    if (!hasKey(a, key)) {
      checkMember(b[key]!, child);
      setKey(patch, key, clone(b[key]!));
    } else if (!deepEqual(a[key]!, b[key]!)) {
      checkMember(b[key]!, child);
      setKey(
        patch,
        key,
        isObject(a[key]) && isObject(b[key]) ? create(a[key]!, b[key]!, child) : clone(b[key]!),
      );
    }
  }
  return patch;
}

function checkMember(value: JsonValue, path: string): void {
  if (value === null) {
    throw new JsonDeltaError(
      'MERGE_NULL',
      `a merge patch cannot set "${path}" to null; use a JSON Patch instead`,
      {
        path,
      },
    );
  }
  checkNoNull(value, path);
}

/** Inside a new object every null member would be read as "remove". */
function checkNoNull(value: JsonValue, path: string): void {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) checkMember(value[key]!, appendPointer(path, key));
}
