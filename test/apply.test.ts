import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyOperation,
  applyPatch,
  type ErrorCode,
  type JsonPatch,
  JsonDeltaError,
  type JsonValue,
  validatePatch,
} from '../src/index.js';

const code = (expected: ErrorCode) => (err: unknown) =>
  err instanceof JsonDeltaError && err.code === expected;

describe('applyPatch: RFC 6902 appendix A', () => {
  const ok: [string, JsonValue, unknown[], JsonValue][] = [
    [
      'A.1 adding an object member',
      { foo: 'bar' },
      [{ op: 'add', path: '/baz', value: 'qux' }],
      { baz: 'qux', foo: 'bar' },
    ],
    [
      'A.2 adding an array element',
      { foo: ['bar', 'baz'] },
      [{ op: 'add', path: '/foo/1', value: 'qux' }],
      { foo: ['bar', 'qux', 'baz'] },
    ],
    [
      'A.3 removing an object member',
      { baz: 'qux', foo: 'bar' },
      [{ op: 'remove', path: '/baz' }],
      { foo: 'bar' },
    ],
    [
      'A.4 removing an array element',
      { foo: ['bar', 'qux', 'baz'] },
      [{ op: 'remove', path: '/foo/1' }],
      { foo: ['bar', 'baz'] },
    ],
    [
      'A.5 replacing a value',
      { baz: 'qux', foo: 'bar' },
      [{ op: 'replace', path: '/baz', value: 'boo' }],
      { baz: 'boo', foo: 'bar' },
    ],
    [
      'A.6 moving a value',
      { foo: { bar: 'baz', waldo: 'fred' }, qux: { corge: 'grault' } },
      [{ op: 'move', from: '/foo/waldo', path: '/qux/thud' }],
      { foo: { bar: 'baz' }, qux: { corge: 'grault', thud: 'fred' } },
    ],
    [
      'A.7 moving an array element',
      { foo: ['all', 'grass', 'cows', 'eat'] },
      [{ op: 'move', from: '/foo/1', path: '/foo/3' }],
      { foo: ['all', 'cows', 'eat', 'grass'] },
    ],
    [
      'A.8 testing a value: success',
      { baz: 'qux', foo: ['a', 2, 'c'] },
      [
        { op: 'test', path: '/baz', value: 'qux' },
        { op: 'test', path: '/foo/1', value: 2 },
      ],
      { baz: 'qux', foo: ['a', 2, 'c'] },
    ],
    [
      'A.10 adding a nested member object',
      { foo: 'bar' },
      [{ op: 'add', path: '/child', value: { grandchild: {} } }],
      { foo: 'bar', child: { grandchild: {} } },
    ],
    [
      'A.11 ignoring unrecognized elements',
      { foo: 'bar' },
      [{ op: 'add', path: '/baz', value: 'qux', xyz: 123 }],
      { foo: 'bar', baz: 'qux' },
    ],
    [
      'A.14 ~ escape ordering',
      { '/': 9, '~1': 10 },
      [{ op: 'test', path: '/~01', value: 10 }],
      { '/': 9, '~1': 10 },
    ],
    [
      'A.16 adding an array value',
      { foo: ['bar'] },
      [{ op: 'add', path: '/foo/-', value: ['abc', 'def'] }],
      { foo: ['bar', ['abc', 'def']] },
    ],
  ];
  for (const [name, doc, patch, expected] of ok) {
    it(name, () => {
      assert.deepEqual(applyPatch(doc, patch as JsonPatch), expected);
    });
  }

  it('A.9 testing a value: error', () => {
    assert.throws(
      () => applyPatch({ baz: 'qux' }, [{ op: 'test', path: '/baz', value: 'bar' }]),
      code('TEST_FAILED'),
    );
  });

  it('A.12 adding to a nonexistent target', () => {
    assert.throws(
      () => applyPatch({ foo: 'bar' }, [{ op: 'add', path: '/baz/bat', value: 'qux' }]),
      code('PATH_NOT_FOUND'),
    );
  });

  it('A.13 invalid JSON Patch document (duplicate "op", last one wins in JSON.parse)', () => {
    const patch = JSON.parse('[{ "op": "add", "path": "/baz", "value": "qux", "op": "remove" }]');
    assert.throws(() => applyPatch({ foo: 'bar' }, patch), JsonDeltaError);
  });

  it('A.15 comparing strings and numbers', () => {
    assert.throws(
      () => applyPatch({ '/': 9, '~1': 10 }, [{ op: 'test', path: '/~01', value: '10' }]),
      code('TEST_FAILED'),
    );
  });
});

describe('applyPatch: section 4 rules', () => {
  it('add replaces the root and existing members', () => {
    assert.deepEqual(applyPatch({ a: 1 }, [{ op: 'add', path: '', value: [1] }]), [1]);
    assert.deepEqual(applyPatch({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), { a: 2 });
    assert.deepEqual(applyPatch([1, 2], [{ op: 'add', path: '/2', value: 3 }]), [1, 2, 3]);
    assert.deepEqual(applyPatch({ '': 1 }, [{ op: 'add', path: '/', value: 2 }]), { '': 2 });
  });

  it('add rejects out-of-range and malformed indices', () => {
    for (const path of ['/3', '/-1', '/01', '/x', '/1.0']) {
      assert.throws(() => applyPatch([1, 2], [{ op: 'add', path, value: 0 }]), code('INVALID_INDEX'), path);
    }
  });

  it('remove needs an existing target and never takes "-"', () => {
    assert.throws(() => applyPatch({}, [{ op: 'remove', path: '/a' }]), code('PATH_NOT_FOUND'));
    assert.throws(() => applyPatch([1], [{ op: 'remove', path: '/1' }]), code('INVALID_INDEX'));
    assert.throws(() => applyPatch([1], [{ op: 'remove', path: '/-' }]), code('INVALID_INDEX'));
    assert.throws(() => applyPatch({}, [{ op: 'remove', path: '' }]), code('INVALID_OPERATION'));
  });

  it('replace needs an existing target and keeps key order', () => {
    assert.throws(() => applyPatch({}, [{ op: 'replace', path: '/a', value: 1 }]), code('PATH_NOT_FOUND'));
    const out = applyPatch({ a: 1, b: 2, c: 3 }, [{ op: 'replace', path: '/a', value: 9 }]);
    assert.deepEqual(Object.keys(out as object), ['a', 'b', 'c']);
    assert.deepEqual(applyPatch([1, 2], [{ op: 'replace', path: '/1', value: 'x' }]), [1, 'x']);
    assert.deepEqual(applyPatch(1, [{ op: 'replace', path: '', value: 'x' }]), 'x');
  });

  it('move into its own child fails; move to itself is a no-op', () => {
    assert.throws(
      () => applyPatch({ a: { b: 1 } }, [{ op: 'move', from: '/a', path: '/a/c' }]),
      code('MOVE_INTO_CHILD'),
    );
    assert.deepEqual(applyPatch({ a: 1 }, [{ op: 'move', from: '/a', path: '/a' }]), { a: 1 });
    assert.throws(() => applyPatch({}, [{ op: 'move', from: '/x', path: '/x' }]), code('PATH_NOT_FOUND'));
    assert.deepEqual(applyPatch({ ab: 1 }, [{ op: 'move', from: '/ab', path: '/a' }]), { a: 1 });
    assert.deepEqual(applyPatch([1, 2, 3], [{ op: 'move', from: '/0', path: '/-' }]), [2, 3, 1]);
  });

  it('copy makes an independent copy', () => {
    const out = applyPatch<{ a: { x: number[] }; b: { x: number[] } }>({ a: { x: [1] } }, [
      { op: 'copy', from: '/a', path: '/b' },
      { op: 'add', path: '/b/x/-', value: 2 },
    ]);
    assert.deepEqual(out, { a: { x: [1] }, b: { x: [1, 2] } });
    assert.throws(() => applyPatch({}, [{ op: 'copy', from: '/nope', path: '/b' }]), code('PATH_NOT_FOUND'));
  });

  it('test compares deeply, ignoring object key order but not array order', () => {
    const doc = { a: { x: 1, y: [1, 2] } };
    assert.doesNotThrow(() => applyPatch(doc, [{ op: 'test', path: '/a', value: { y: [1, 2], x: 1 } }]));
    assert.throws(() => applyPatch(doc, [{ op: 'test', path: '/a/y', value: [2, 1] }]), code('TEST_FAILED'));
    assert.throws(() => applyPatch(doc, [{ op: 'test', path: '/a/z', value: null }]), code('PATH_NOT_FOUND'));
    assert.throws(() => applyPatch([1], [{ op: 'test', path: '/-', value: 1 }]), code('INVALID_INDEX'));
    assert.doesNotThrow(() => applyPatch(doc, [{ op: 'test', path: '', value: doc }]));
  });

  it('is atomic and does not change the input by default', () => {
    const doc = { a: [1, 2], b: 1 };
    const err = (() => {
      try {
        applyPatch(doc, [
          { op: 'add', path: '/a/-', value: 3 },
          { op: 'test', path: '/b', value: 2 },
        ]);
      } catch (e) {
        return e;
      }
    })();
    assert.ok(err instanceof JsonDeltaError);
    assert.equal(err.operationIndex, 1);
    assert.equal(err.path, '/b');
    assert.deepEqual(doc, { a: [1, 2], b: 1 });
  });

  it('mutates in place with { mutate: true }', () => {
    const doc = { a: [1] };
    const out = applyPatch(doc, [{ op: 'add', path: '/a/-', value: 2 }], { mutate: true });
    assert.equal(out, doc);
    assert.deepEqual(doc, { a: [1, 2] });
  });

  it('does not let values share structure with the patch', () => {
    const value = { deep: [1] };
    const out = applyPatch<{ v: { deep: number[] } }>({}, [{ op: 'add', path: '/v', value }]);
    out.v.deep.push(2);
    assert.deepEqual(value, { deep: [1] });
  });

  it('treats __proto__ as an ordinary member', () => {
    const out = applyPatch<Record<string, unknown>>({}, [
      { op: 'add', path: '/__proto__', value: { polluted: true } },
    ]);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.getPrototypeOf(out), Object.prototype);
    assert.deepEqual(Object.keys(out), ['__proto__']);
    assert.throws(() => applyPatch({}, [{ op: 'remove', path: '/constructor' }]), code('PATH_NOT_FOUND'));
    assert.throws(
      () => applyPatch({}, [{ op: 'add', path: '/constructor/prototype/x', value: 1 }]),
      code('PATH_NOT_FOUND'),
    );
  });

  it('applyOperation works on a single operation', () => {
    const doc = { a: 1 };
    assert.deepEqual(applyOperation(doc, { op: 'add', path: '/b', value: 2 }), { a: 1, b: 2 });
  });
});

describe('validatePatch', () => {
  it('accepts a valid patch', () => {
    assert.doesNotThrow(() =>
      validatePatch([
        { op: 'remove', path: '/a' },
        { op: 'copy', from: '', path: '/b' },
      ]),
    );
  });

  it('rejects malformed patches with useful messages', () => {
    const cases: [unknown, ErrorCode, RegExp][] = [
      [{}, 'INVALID_PATCH', /must be an array/],
      [[null], 'INVALID_OPERATION', /operation 0: must be an object/],
      [[{ op: 'nope', path: '' }], 'INVALID_OPERATION', /"op" must be one of/],
      [[{ path: '/a' }], 'INVALID_OPERATION', /"op" must be one of/],
      [[{ op: 'add', path: '/a' }], 'INVALID_OPERATION', /"add" needs a "value"/],
      [[{ op: 'remove' }], 'INVALID_OPERATION', /needs a string "path"/],
      [[{ op: 'move', path: '/a' }], 'INVALID_OPERATION', /needs a string "from"/],
      [[{ op: 'remove', path: 'a' }], 'INVALID_POINTER', /must start with/],
      [[{ op: 'copy', from: '/a~3', path: '/b' }], 'INVALID_POINTER', /operation 0: /],
      [[{ op: 'add', path: '/a', value: undefined }], 'INVALID_OPERATION', /not a JSON value/],
      [[{ op: 'test', path: '/a', value: Number.NaN }], 'INVALID_OPERATION', /not a JSON value/],
    ];
    for (const [patch, expected, message] of cases) {
      assert.throws(
        () => validatePatch(patch),
        (err: unknown) => err instanceof JsonDeltaError && err.code === expected && message.test(err.message),
        JSON.stringify(patch),
      );
    }
  });

  it('rejects documents that are not JSON', () => {
    assert.throws(() => applyPatch(new Date() as never, []), code('NOT_JSON'));
    assert.throws(() => applyPatch({ a: () => 1 } as never, []), code('NOT_JSON'));
  });
});
