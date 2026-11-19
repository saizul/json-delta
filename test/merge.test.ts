import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyMergePatch, createMergePatch, JsonDeltaError, type JsonValue } from '../src/index.js';

// RFC 7386, appendix A.
const RFC: [JsonValue, JsonValue, JsonValue][] = [
  [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
  [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
  [{ a: 'b' }, { a: null }, {}],
  [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
  [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
  [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
  [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
  [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
  [
    ['a', 'b'],
    ['c', 'd'],
    ['c', 'd'],
  ],
  [{ a: 'b' }, ['c'], ['c']],
  [{ a: 'foo' }, null, null],
  [{ a: 'foo' }, 'bar', 'bar'],
  [{ e: null }, { a: 1 }, { e: null, a: 1 }],
  [[1, 2], { a: 'b', c: null }, { a: 'b' }],
  [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
];

describe('applyMergePatch', () => {
  RFC.forEach(([target, patch, expected], i) => {
    it(`RFC 7386 example ${i + 1}`, () => {
      assert.deepEqual(applyMergePatch(target, patch), expected);
    });
  });

  it('does not change its inputs', () => {
    const target = { a: { b: 1 } };
    const patch = { a: { c: [1] } };
    const out = applyMergePatch<{ a: { c: number[] } }>(target, patch);
    out.a.c.push(2);
    assert.deepEqual(target, { a: { b: 1 } });
    assert.deepEqual(patch, { a: { c: [1] } });
  });

  it('treats __proto__ as an ordinary member', () => {
    const out = applyMergePatch<object>({}, JSON.parse('{"__proto__": {"polluted": true}}'));
    assert.equal(Object.getPrototypeOf(out), Object.prototype);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.deepEqual(Object.keys(out), ['__proto__']);
  });
});

describe('createMergePatch', () => {
  it('round-trips through applyMergePatch', () => {
    const pairs: [JsonValue, JsonValue][] = [
      [
        { a: 1, b: { c: 2, d: 3 } },
        { a: 1, b: { c: 4 }, e: [1, null] },
      ],
      [
        { title: 'Hello', author: { name: 'x' }, tags: ['a'] },
        { title: 'Hi', author: {}, tags: ['a', 'b'] },
      ],
      [[1], { a: 1 }],
      [{ a: 1 }, 'text'],
      [1, 2],
      [{ a: { b: { c: 1 } } }, { a: { b: { c: 1, d: 2 } } }],
    ];
    for (const [a, b] of pairs)
      assert.deepEqual(applyMergePatch(a, createMergePatch(a, b)), b, JSON.stringify(b));
  });

  it('produces minimal patches', () => {
    assert.deepEqual(createMergePatch({ a: 1, b: 2 }, { a: 1, b: 3 }), { b: 3 });
    assert.deepEqual(createMergePatch({ a: 1, b: 2 }, { a: 1 }), { b: null });
    assert.deepEqual(createMergePatch({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 3 } }), { a: { y: 3 } });
    assert.deepEqual(createMergePatch({ a: [1, 2] }, { a: [1, 3] }), { a: [1, 3] });
    assert.deepEqual(createMergePatch({ a: 1 }, { a: 1 }), {});
  });

  it('refuses to set a member to null', () => {
    for (const [a, b] of [
      [{ a: 1 }, { a: null }],
      [{}, { a: null }],
      [{}, { a: { b: null } }],
      [{ a: 1 }, { a: { b: { c: null } } }],
      [1, { x: null }],
    ] as [JsonValue, JsonValue][]) {
      assert.throws(
        () => createMergePatch(a, b),
        (err: unknown) => err instanceof JsonDeltaError && err.code === 'MERGE_NULL',
        JSON.stringify(b),
      );
    }
    // Nulls inside arrays are fine: arrays are replaced as a whole.
    assert.deepEqual(createMergePatch({}, { a: [null] }), { a: [null] });
    assert.equal(createMergePatch({ a: 1 }, null), null);
  });
});
