import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendPointer,
  escapeToken,
  formatPointer,
  getValue,
  hasValue,
  isPointerPrefix,
  JsonDeltaError,
  parseIndex,
  parsePointer,
  unescapeToken,
} from '../src/index.js';

// RFC 6901, section 5.
const DOC = {
  foo: ['bar', 'baz'],
  '': 0,
  'a/b': 1,
  'c%d': 2,
  'e^f': 3,
  'g|h': 4,
  'i\\j': 5,
  'k"l': 6,
  ' ': 7,
  'm~n': 8,
};

describe('JSON Pointer', () => {
  it('evaluates the RFC 6901 examples', () => {
    const cases: [string, unknown][] = [
      ['', DOC],
      ['/foo', ['bar', 'baz']],
      ['/foo/0', 'bar'],
      ['/', 0],
      ['/a~1b', 1],
      ['/c%d', 2],
      ['/e^f', 3],
      ['/g|h', 4],
      ['/i\\j', 5],
      ['/k"l', 6],
      ['/ ', 7],
      ['/m~0n', 8],
    ];
    for (const [pointer, expected] of cases) assert.deepEqual(getValue(DOC, pointer), expected, pointer);
  });

  it('escapes ~ before / and unescapes in the opposite order', () => {
    assert.equal(escapeToken('a/b~c'), 'a~1b~0c');
    assert.equal(escapeToken('~1'), '~01');
    assert.equal(unescapeToken('~01'), '~1');
    assert.equal(unescapeToken('a~1b~0c'), 'a/b~c');
    assert.equal(escapeToken(3), '3');
  });

  it('parses and formats pointers', () => {
    assert.deepEqual(parsePointer(''), []);
    assert.deepEqual(parsePointer('/'), ['']);
    assert.deepEqual(parsePointer('/a~1b/~0/0'), ['a/b', '~', '0']);
    assert.equal(formatPointer(['a/b', '~', 0]), '/a~1b/~0/0');
    assert.equal(formatPointer([]), '');
    assert.equal(appendPointer('/x', 'y/z'), '/x/y~1z');
    for (const tokens of [
      ['a', ''],
      ['~1', '/', '~0~1'],
      ['', '', ''],
    ]) {
      assert.deepEqual(parsePointer(formatPointer(tokens)), tokens);
    }
  });

  it('rejects invalid pointers', () => {
    for (const bad of ['foo', '/a~2', '/a~', '#/foo']) {
      assert.throws(
        () => parsePointer(bad),
        (err: unknown) => err instanceof JsonDeltaError && err.code === 'INVALID_POINTER',
        bad,
      );
    }
    assert.throws(() => parsePointer(1 as unknown as string), /must be a string/);
  });

  it('parses array indices strictly', () => {
    assert.equal(parseIndex('0'), 0);
    assert.equal(parseIndex('12'), 12);
    for (const bad of ['01', '-1', '1.5', '', '-', ' 1', '1e2'])
      assert.equal(parseIndex(bad), undefined, bad);
  });

  it('reports missing values as undefined', () => {
    assert.equal(getValue(DOC, '/foo/2'), undefined);
    assert.equal(getValue(DOC, '/foo/01'), undefined);
    assert.equal(getValue(DOC, '/foo/-'), undefined);
    assert.equal(getValue(DOC, '/nope/x'), undefined);
    assert.equal(getValue(DOC, '/foo/0/x'), undefined);
    assert.equal(getValue({}, '/constructor'), undefined);
    assert.equal(getValue({}, '/__proto__'), undefined);
    assert.equal(hasValue(DOC, '/'), true);
    assert.equal(hasValue({ a: null }, '/a'), true);
    assert.equal(hasValue(DOC, '/zzz'), false);
  });

  it('knows when one pointer is inside another', () => {
    assert.equal(isPointerPrefix('/a', '/a/b'), true);
    assert.equal(isPointerPrefix('/a', '/a'), true);
    assert.equal(isPointerPrefix('/a', '/ab'), false);
    assert.equal(isPointerPrefix('', '/a'), true);
  });
});
