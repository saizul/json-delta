import { applyOperation, validatePatch } from './apply.js';
import { JsonDeltaError } from './errors.js';
import { formatPointer, getValue, parsePointer } from './pointer.js';
import type { JsonPatch, JsonValue, Operation } from './types.js';
import { assertJson, clone, deepEqual, isObject } from './value.js';

/**
 * Returns the patch that undoes `patch`: applying `patch` and then the result
 * gives back the original document.
 *
 * Without `original`, the old values come from the `test` operation right
 * before each `remove` and `replace`, so the patch must have been made with
 * `diff(a, b, { invertible: true })`. With `original` (the document the patch
 * applies to), any valid patch can be inverted, including appends with `-`,
 * `copy` and `add` over an existing member.
 *
 * The inverse is itself invertible: it carries a `test` with the expected
 * value before each `remove` and `replace`, so undoing a document that changed
 * in the meantime fails instead of losing data.
 */
export function invertPatch(patch: JsonPatch, original?: JsonValue): JsonPatch {
  validatePatch(patch);
  let doc: JsonValue | undefined;
  if (original !== undefined) {
    assertJson(original);
    doc = clone(original);
  }
  const groups: Operation[][] = [];

  patch.forEach((operation, index) => {
    const fail = (message: string): never => {
      throw new JsonDeltaError('INVALID_PATCH', `cannot invert operation ${index}: ${message}`, {
        path: operation.path,
        operationIndex: index,
      });
    };
    const oldValueOf = (path: string): JsonValue => {
      if (doc !== undefined) {
        const value = getValue(doc, path);
        if (value === undefined) fail(`"${path}" does not exist`);
        return clone(value as JsonValue);
      }
      const previous = patch[index - 1];
      if (previous?.op === 'test' && previous.path === path) return clone(previous.value);
      return fail(
        `${operation.op} needs a "test" with the old value before it; diff with { invertible: true } or pass the original document`,
      );
    };
    /** What sits at `path` before an add, copy or move writes to it: `undefined` when nothing is overwritten. */
    const overwritten = (path: string): JsonValue | undefined => {
      if (path === '')
        return doc === undefined ? fail('replacing the root needs the original document') : clone(doc);
      const tokens = parsePointer(path);
      if (doc === undefined) {
        if (tokens[tokens.length - 1] === '-') fail('appending with "-" needs the original document');
        return undefined;
      }
      const parent = getValue(doc, formatPointer(tokens.slice(0, -1)));
      if (!isObject(parent)) return undefined; // array inserts never overwrite
      const value = getValue(doc, path);
      return value === undefined ? undefined : clone(value);
    };
    /** Resolves a trailing `-` to the index the value ended up at, once the operation is applied. */
    const resolved = (path: string): string => {
      const tokens = parsePointer(path);
      if (doc === undefined || tokens[tokens.length - 1] !== '-') return path;
      const parent = getValue(doc, formatPointer(tokens.slice(0, -1))) as JsonValue[];
      return formatPointer([...tokens.slice(0, -1), parent.length - 1]);
    };
    /** Undoes writing `value` at `path`, which held `before` (or nothing). */
    const undoWrite = (path: string, value: JsonValue, before: JsonValue | undefined): Operation[] =>
      before === undefined
        ? [
            { op: 'test', path, value: clone(value) },
            { op: 'remove', path },
          ]
        : [
            { op: 'test', path, value: clone(value) },
            { op: 'replace', path, value: before },
          ];

    let inverse: Operation[];
    switch (operation.op) {
      case 'test':
        inverse = [{ op: 'test', path: operation.path, value: clone(operation.value) }];
        break;
      case 'remove':
        inverse = [{ op: 'add', path: operation.path, value: oldValueOf(operation.path) }];
        break;
      case 'replace':
        inverse = undoWrite(operation.path, operation.value, oldValueOf(operation.path));
        break;
      case 'add': {
        const before = overwritten(operation.path);
        if (doc !== undefined) doc = applyOperation(doc, operation, index);
        inverse = undoWrite(resolved(operation.path), operation.value, before);
        break;
      }
      case 'copy': {
        const value =
          doc === undefined ? fail('copy needs the original document') : getValue(doc, operation.from);
        if (value === undefined) fail(`"${operation.from}" does not exist`);
        const before = overwritten(operation.path);
        doc = applyOperation(doc as JsonValue, operation, index);
        inverse = undoWrite(resolved(operation.path), value as JsonValue, before);
        break;
      }
      case 'move': {
        if (operation.from === operation.path) {
          inverse = [];
          break;
        }
        const before = overwritten(operation.path);
        if (doc !== undefined) doc = applyOperation(doc, operation, index);
        const at = resolved(operation.path);
        inverse = [{ op: 'move', from: at, path: operation.from }];
        if (before !== undefined) inverse.push({ op: 'add', path: at, value: before });
        break;
      }
    }
    if (doc !== undefined && operation.op !== 'add' && operation.op !== 'copy' && operation.op !== 'move') {
      doc = applyOperation(doc, operation, index);
    }
    groups.push(inverse);
  });

  const result: JsonPatch = [];
  for (let i = groups.length - 1; i >= 0; i--) result.push(...groups[i]!);
  return dropRedundantTests(result);
}

/** Removes a `test` that repeats the one right before it (a test before a test of the same value). */
function dropRedundantTests(patch: JsonPatch): JsonPatch {
  return patch.filter((op, i) => {
    const prev = patch[i - 1];
    return !(
      op.op === 'test' &&
      prev?.op === 'test' &&
      prev.path === op.path &&
      deepEqual(prev.value, op.value)
    );
  });
}
