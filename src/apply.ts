import { JsonDeltaError } from './errors.js';
import { isPointerPrefix, parseIndex, parsePointer } from './pointer.js';
import type { ApplyOptions, JsonPatch, JsonValue, Operation } from './types.js';
import { assertJson, clone, deepEqual, hasKey, isObject, setKey } from './value.js';

const OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);

/**
 * Checks that `patch` is a well-formed JSON Patch document (an array of
 * operations with the members each `op` needs) without applying it. Throws
 * `INVALID_PATCH`, `INVALID_OPERATION` or `INVALID_POINTER`.
 */
export function validatePatch(patch: unknown): asserts patch is JsonPatch {
  if (!Array.isArray(patch)) {
    throw new JsonDeltaError('INVALID_PATCH', 'a JSON Patch must be an array of operations');
  }
  patch.forEach((operation, index) => {
    validateOperation(operation, index);
  });
}

function validateOperation(operation: unknown, index: number): asserts operation is Operation {
  const fail = (message: string): never => {
    throw new JsonDeltaError('INVALID_OPERATION', `operation ${index}: ${message}`, {
      operationIndex: index,
    });
  };
  if (!isObject(operation)) return fail('must be an object');
  const op = operation.op;
  if (typeof op !== 'string' || !OPS.has(op)) {
    return fail(`"op" must be one of add, remove, replace, move, copy, test (got ${JSON.stringify(op)})`);
  }
  if (typeof operation.path !== 'string') return fail(`"${op}" needs a string "path"`);
  try {
    parsePointer(operation.path);
    if (op === 'move' || op === 'copy') {
      if (typeof operation.from !== 'string') fail(`"${op}" needs a string "from"`);
      parsePointer(operation.from as string);
    }
  } catch (err) {
    if (err instanceof JsonDeltaError && err.code === 'INVALID_POINTER') {
      throw new JsonDeltaError('INVALID_POINTER', `operation ${index}: ${err.message}`, {
        path: err.path ?? '',
        operationIndex: index,
      });
    }
    throw err;
  }
  if ((op === 'add' || op === 'replace' || op === 'test') && !hasKey(operation, 'value')) {
    fail(`"${op}" needs a "value"`);
  }
  if (hasKey(operation, 'value')) {
    try {
      assertJson(operation.value);
    } catch {
      fail('"value" is not a JSON value');
    }
  }
}

interface Location {
  parent: JsonValue[] | Record<string, JsonValue>;
  token: string;
}

function locate(doc: JsonValue, path: string, index: number): Location {
  const tokens = parsePointer(path);
  let parent: JsonValue = doc;
  for (let t = 0; t < tokens.length - 1; t++) {
    const token = tokens[t]!;
    let next: JsonValue | undefined;
    if (Array.isArray(parent)) {
      const i = parseIndex(token);
      next = i === undefined ? undefined : parent[i];
    } else if (isObject(parent)) {
      next = hasKey(parent, token) ? parent[token] : undefined;
    }
    if (next === undefined) {
      throw new JsonDeltaError('PATH_NOT_FOUND', `operation ${index}: "${path}" does not exist`, {
        path,
        operationIndex: index,
      });
    }
    parent = next;
  }
  if (!Array.isArray(parent) && !isObject(parent)) {
    throw new JsonDeltaError(
      'PATH_NOT_FOUND',
      `operation ${index}: the parent of "${path}" is not a container`,
      {
        path,
        operationIndex: index,
      },
    );
  }
  return { parent, token: tokens[tokens.length - 1]! };
}

function arrayIndex(arr: JsonValue[], token: string, path: string, index: number, forAdd: boolean): number {
  if (forAdd && token === '-') return arr.length;
  const i = parseIndex(token);
  const max = forAdd ? arr.length : arr.length - 1;
  if (i === undefined || i > max) {
    throw new JsonDeltaError(
      'INVALID_INDEX',
      `operation ${index}: "${token}" is not a valid array index in "${path}" (array length ${arr.length})`,
      { path, operationIndex: index },
    );
  }
  return i;
}

function read(doc: JsonValue, path: string, index: number): JsonValue {
  if (path === '') return doc;
  const { parent, token } = locate(doc, path, index);
  if (Array.isArray(parent)) return parent[arrayIndex(parent, token, path, index, false)]!;
  if (!hasKey(parent, token)) {
    throw new JsonDeltaError('PATH_NOT_FOUND', `operation ${index}: "${path}" does not exist`, {
      path,
      operationIndex: index,
    });
  }
  return parent[token]!;
}

function add(doc: JsonValue, path: string, value: JsonValue, index: number): JsonValue {
  if (path === '') return value;
  const { parent, token } = locate(doc, path, index);
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, token, path, index, true), 0, value);
  else setKey(parent, token, value);
  return doc;
}

function remove(doc: JsonValue, path: string, index: number): JsonValue {
  if (path === '') {
    throw new JsonDeltaError('INVALID_OPERATION', `operation ${index}: cannot remove the whole document`, {
      path,
      operationIndex: index,
    });
  }
  const { parent, token } = locate(doc, path, index);
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(parent, token, path, index, false), 1);
  } else {
    if (!hasKey(parent, token)) {
      throw new JsonDeltaError('PATH_NOT_FOUND', `operation ${index}: "${path}" does not exist`, {
        path,
        operationIndex: index,
      });
    }
    delete parent[token];
  }
  return doc;
}

/** Replaces an existing value, keeping its position (and object key order). */
function replace(doc: JsonValue, path: string, value: JsonValue, index: number): JsonValue {
  if (path === '') return value;
  const { parent, token } = locate(doc, path, index);
  if (Array.isArray(parent)) parent[arrayIndex(parent, token, path, index, false)] = value;
  else setKey(parent, token, value);
  return doc;
}

/**
 * Applies one operation to `document` in place and returns the new document
 * (which is a different value only when the root is replaced).
 */
export function applyOperation(document: JsonValue, operation: Operation, index = 0): JsonValue {
  validateOperation(operation, index);
  const { path } = operation;
  switch (operation.op) {
    case 'add':
      return add(document, path, clone(operation.value), index);
    case 'remove':
      return remove(document, path, index);
    case 'replace':
      read(document, path, index);
      return replace(document, path, clone(operation.value), index);
    case 'move': {
      const { from } = operation;
      if (from === path) {
        read(document, from, index);
        return document;
      }
      if (isPointerPrefix(from, path)) {
        throw new JsonDeltaError(
          'MOVE_INTO_CHILD',
          `operation ${index}: cannot move "${from}" into its own child`,
          {
            path,
            operationIndex: index,
          },
        );
      }
      const value = read(document, from, index);
      return add(remove(document, from, index), path, value, index);
    }
    case 'copy':
      return add(document, path, clone(read(document, operation.from, index)), index);
    case 'test': {
      const actual = read(document, path, index);
      if (!deepEqual(actual, operation.value)) {
        throw new JsonDeltaError(
          'TEST_FAILED',
          `operation ${index}: test failed at "${path}": expected ${JSON.stringify(operation.value)}, found ${JSON.stringify(actual)}`,
          { path, operationIndex: index },
        );
      }
      return document;
    }
  }
}

/**
 * Applies an RFC 6902 JSON Patch and returns the result. By default the input
 * is not changed and the whole patch is atomic: if any operation fails (a
 * `test` that does not match, a missing path) a `JsonDeltaError` is thrown and
 * nothing is modified.
 */
export function applyPatch<T = JsonValue>(
  document: JsonValue,
  patch: JsonPatch,
  options: ApplyOptions = {},
): T {
  validatePatch(patch);
  assertJson(document);
  let doc = options.mutate ? document : clone(document);
  patch.forEach((operation, index) => {
    doc = applyOperation(doc, operation, index);
  });
  return doc as T;
}
