import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPatch,
  diff,
  invertPatch,
  type JsonPatch,
  JsonDeltaError,
  type JsonValue,
} from '../src/index.js';

/** Applies `patch` to `original`, then its inverse, and checks the round trip. */
function undo(original: JsonValue, patch: JsonPatch, withOriginal = true) {
  const changed = applyPatch(original, patch);
  const inverse = invertPatch(patch, withOriginal ? original : undefined);
  assert.deepEqual(applyPatch(changed, inverse), original);
  return inverse;
}

describe('invertPatch', () => {
  it('inverts a patch made with invertible: true without the original', () => {
    const a = { name: 'Rahim', tags: ['x', 'y'], age: 30 };
    const b = { name: 'Karim', tags: ['x'], city: 'Dhaka' };
    const patch = diff(a, b, { invertible: true });
    const inverse = undo(a, patch, false);
    assert.ok(inverse.some((op) => op.op === 'test'));
  });

  it('produces tests so the undo fails on a document that changed since', () => {
    const inverse = invertPatch([
      { op: 'test', path: '/a', value: 1 },
      { op: 'replace', path: '/a', value: 2 },
    ]);
    assert.deepEqual(inverse, [
      { op: 'test', path: '/a', value: 2 },
      { op: 'replace', path: '/a', value: 1 },
      { op: 'test', path: '/a', value: 1 },
    ]);
    assert.throws(() => applyPatch({ a: 5 }, inverse), JsonDeltaError);
  });

  it('needs the original for remove or replace without a test', () => {
    assert.throws(
      () => invertPatch([{ op: 'remove', path: '/a' }]),
      (err: unknown) =>
        err instanceof JsonDeltaError && err.code === 'INVALID_PATCH' && err.operationIndex === 0,
    );
    assert.deepEqual(invertPatch([{ op: 'remove', path: '/a' }], { a: [1] }), [
      { op: 'add', path: '/a', value: [1] },
    ]);
  });

  it('resolves "-" appends against the original', () => {
    const inverse = undo({ list: [1, 2] }, [
      { op: 'add', path: '/list/-', value: 3 },
      { op: 'add', path: '/list/-', value: 4 },
    ]);
    assert.deepEqual(inverse, [
      { op: 'test', path: '/list/3', value: 4 },
      { op: 'remove', path: '/list/3' },
      { op: 'test', path: '/list/2', value: 3 },
      { op: 'remove', path: '/list/2' },
    ]);
    assert.throws(() => invertPatch([{ op: 'add', path: '/list/-', value: 3 }]), JsonDeltaError);
  });

  it('restores members that add, copy and move overwrote', () => {
    undo({ a: 1, b: 2 }, [{ op: 'add', path: '/a', value: 9 }]);
    undo({ a: { x: 1 }, b: 2 }, [{ op: 'copy', from: '/a', path: '/b' }]);
    undo({ a: 1, b: 2 }, [{ op: 'move', from: '/a', path: '/b' }]);
    undo({ list: ['a', 'b', 'c'] }, [{ op: 'copy', from: '/list/0', path: '/list/-' }]);
  });

  it('inverts array moves and moves onto themselves', () => {
    undo(
      ['a', 'b', 'c', 'd'],
      [
        { op: 'move', from: '/0', path: '/3' },
        { op: 'move', from: '/2', path: '/0' },
      ],
    );
    undo(['a', 'b', 'c'], [{ op: 'move', from: '/1', path: '/-' }]);
    assert.deepEqual(invertPatch([{ op: 'move', from: '/a', path: '/a' }]), []);
  });

  it('inverts a replacement of the whole document', () => {
    undo({ a: 1 }, [{ op: 'replace', path: '', value: [1, 2] }]);
    undo({ a: 1 }, [{ op: 'add', path: '', value: 'x' }]);
    assert.throws(() => invertPatch([{ op: 'add', path: '', value: 'x' }]), JsonDeltaError);
  });

  it('checks the original against the patch while inverting', () => {
    assert.throws(
      () => invertPatch([{ op: 'test', path: '/a', value: 1 }], { a: 2 }),
      (err: unknown) => err instanceof JsonDeltaError && err.code === 'TEST_FAILED',
    );
    assert.throws(() => invertPatch([{ op: 'nope' }] as never), JsonDeltaError);
  });

  it('does not share structure with the patch or the original', () => {
    const original = { a: { deep: [1] } };
    const inverse = invertPatch([{ op: 'remove', path: '/a' }], original);
    (inverse[0] as unknown as { value: { deep: number[] } }).value.deep.push(2);
    assert.deepEqual(original, { a: { deep: [1] } });
  });
});
