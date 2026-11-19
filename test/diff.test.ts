import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPatch,
  changes,
  type DiffOptions,
  diff,
  formatChanges,
  JsonDeltaError,
  type JsonPatch,
  type JsonValue,
  summarize,
} from '../src/index.js';

function roundTrip(a: JsonValue, b: JsonValue, options: DiffOptions = {}): JsonPatch {
  const patch = diff(a, b, options);
  assert.deepEqual(applyPatch(a, patch), b, `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return patch;
}

describe('diff: values and objects', () => {
  it('returns [] for equal values, ignoring key order', () => {
    assert.deepEqual(diff({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }), []);
    assert.deepEqual(diff(null, null), []);
    assert.deepEqual(diff(0, -0), []);
  });

  it('replaces the root when types differ', () => {
    assert.deepEqual(roundTrip(1, '1'), [{ op: 'replace', path: '', value: '1' }]);
    assert.deepEqual(roundTrip({}, []), [{ op: 'replace', path: '', value: [] }]);
    assert.deepEqual(roundTrip(null, { a: 1 }), [{ op: 'replace', path: '', value: { a: 1 } }]);
  });

  it('adds, removes and replaces object members', () => {
    assert.deepEqual(roundTrip({ a: 1, b: 2, c: { d: 1 } }, { a: 1, c: { d: 2 }, e: 3 }), [
      { op: 'remove', path: '/b' },
      { op: 'replace', path: '/c/d', value: 2 },
      { op: 'add', path: '/e', value: 3 },
    ]);
  });

  it('escapes keys in paths', () => {
    assert.deepEqual(roundTrip({ 'a/b': 1, 'm~n': 1 }, { 'a/b': 2, 'm~n': 2, '': 0 }), [
      { op: 'replace', path: '/a~1b', value: 2 },
      { op: 'replace', path: '/m~0n', value: 2 },
      { op: 'add', path: '/', value: 0 },
    ]);
  });

  it('handles a __proto__ key safely', () => {
    const a = JSON.parse('{"__proto__": {"x": 1}}');
    const b = JSON.parse('{"__proto__": {"x": 2}, "y": 1}');
    assert.deepEqual(roundTrip(a, b), [
      { op: 'replace', path: '/__proto__/x', value: 2 },
      { op: 'add', path: '/y', value: 1 },
    ]);
  });
});

describe('diff: arrays by value', () => {
  it('appends, inserts and removes with minimal operations', () => {
    assert.deepEqual(roundTrip([1, 2, 3], [1, 2, 3, 4]), [{ op: 'add', path: '/3', value: 4 }]);
    assert.deepEqual(roundTrip([1, 2, 3], [0, 1, 2, 3]), [{ op: 'add', path: '/0', value: 0 }]);
    assert.deepEqual(roundTrip([1, 2, 3], [1, 3]), [{ op: 'remove', path: '/1' }]);
    assert.deepEqual(roundTrip(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'y', 'd']), [
      { op: 'replace', path: '/1', value: 'x' },
      { op: 'add', path: '/3', value: 'y' },
    ]);
  });

  it('removes several items at the same index', () => {
    assert.deepEqual(roundTrip([1, 2, 3, 4, 5], [1, 5]), [
      { op: 'remove', path: '/1' },
      { op: 'remove', path: '/1' },
      { op: 'remove', path: '/1' },
    ]);
  });

  it('patches changed objects in place instead of replacing them', () => {
    assert.deepEqual(roundTrip([{ a: 1, b: 1 }], [{ a: 1, b: 2 }]), [
      { op: 'replace', path: '/0/b', value: 2 },
    ]);
  });

  it('keeps the longest common subsequence', () => {
    const patch = roundTrip(['a', 'b', 'c', 'd', 'e', 'f'], ['b', 'c', 'x', 'e', 'f', 'g']);
    assert.deepEqual(patch, [
      { op: 'remove', path: '/0' },
      { op: 'replace', path: '/2', value: 'x' },
      { op: 'add', path: '/5', value: 'g' },
    ]);
  });

  it('matches equal objects regardless of key order', () => {
    assert.deepEqual(roundTrip([{ a: 1, b: 2 }, 1], [0, { b: 2, a: 1 }, 1]), [
      { op: 'add', path: '/0', value: 0 },
    ]);
  });

  it('falls back to positions for huge arrays', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const b = [-1, ...a, -2];
    assert.equal(roundTrip(a, b).length, 2);
    assert.equal(roundTrip(a, b, { maxLcsCells: 10 }).length, 52);
  });
});

describe('diff: arrays with objectHash', () => {
  const users = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Linus' },
    { id: 3, name: 'Grace' },
  ];

  it('reports a moved item as one move', () => {
    const b = [users[1]!, users[2]!, users[0]!];
    assert.deepEqual(roundTrip(users, b, { objectHash: 'id' }), [{ op: 'move', from: '/0', path: '/2' }]);
    assert.deepEqual(roundTrip(users, [users[2]!, users[0]!, users[1]!], { objectHash: 'id' }), [
      { op: 'move', from: '/2', path: '/0' },
    ]);
  });

  it('patches an item that moved and changed', () => {
    const b = [users[1]!, users[2]!, { id: 1, name: 'Ada Lovelace' }];
    assert.deepEqual(roundTrip(users, b, { objectHash: 'id' }), [
      { op: 'move', from: '/0', path: '/2' },
      { op: 'replace', path: '/2/name', value: 'Ada Lovelace' },
    ]);
  });

  it('removes, adds and moves together', () => {
    const b = [{ id: 4, name: 'Barbara' }, users[2]!, users[0]!];
    assert.deepEqual(roundTrip(users, b, { objectHash: 'id' }), [
      { op: 'remove', path: '/1' },
      { op: 'add', path: '/0', value: { id: 4, name: 'Barbara' } },
      { op: 'move', from: '/1', path: '/2' },
    ]);
  });

  it('without objectHash a rename is a field replace, with it a changed id is remove + add', () => {
    const a = [{ id: 1, v: 1 }];
    const b = [{ id: 2, v: 1 }];
    assert.deepEqual(roundTrip(a, b), [{ op: 'replace', path: '/0/id', value: 2 }]);
    assert.deepEqual(roundTrip(a, b, { objectHash: 'id' }), [
      { op: 'remove', path: '/0' },
      { op: 'add', path: '/0', value: { id: 2, v: 1 } },
    ]);
  });

  it('accepts a function and matches items without an id by value', () => {
    const a: JsonValue = [{ sku: 'a', n: 1 }, 'loose', { sku: 'b', n: 1 }];
    const b: JsonValue = [{ sku: 'b', n: 2 }, 'loose', { sku: 'a', n: 1 }];
    const hash = (item: JsonValue) =>
      typeof item === 'object' && item && !Array.isArray(item) ? (item.sku as string) : undefined;
    const patch = roundTrip(a, b, { objectHash: hash });
    assert.deepEqual(summarize(patch), {
      add: 0,
      remove: 0,
      replace: 1,
      move: 2,
      copy: 0,
      test: 0,
      total: 3,
      paths: ['/2', '/0/n'],
    });
  });

  it('copes with duplicate ids', () => {
    roundTrip([{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 2 }], [{ id: 2 }, { id: 1, v: 'b' }], {
      objectHash: 'id',
    });
  });

  it('works on nested arrays', () => {
    const a = { list: [{ id: 'x', tags: [{ id: 1 }, { id: 2 }] }] };
    const b = { list: [{ id: 'x', tags: [{ id: 2 }, { id: 1 }] }] };
    assert.deepEqual(roundTrip(a, b, { objectHash: 'id' }), [
      { op: 'move', from: '/list/0/tags/0', path: '/list/0/tags/1' },
    ]);
  });

  it('rejects a bad objectHash option', () => {
    assert.throws(() => diff([], [], { objectHash: '' }), TypeError);
  });
});

describe('diff: options and helpers', () => {
  it('adds test operations with invertible', () => {
    const patch = roundTrip({ a: 1, b: 2 }, { a: 3 }, { invertible: true });
    assert.deepEqual(patch, [
      { op: 'test', path: '/a', value: 1 },
      { op: 'replace', path: '/a', value: 3 },
      { op: 'test', path: '/b', value: 2 },
      { op: 'remove', path: '/b' },
    ]);
    assert.throws(() => applyPatch({ a: 9, b: 2 }, patch), JsonDeltaError);
  });

  it('does not share structure with the inputs', () => {
    const b = { list: [{ x: 1 }] };
    const patch = diff({}, b);
    (b.list[0] as { x: number }).x = 2;
    assert.deepEqual(patch, [{ op: 'add', path: '/list', value: [{ x: 1 }] }]);
  });

  it('rejects values that are not JSON', () => {
    assert.throws(() => diff({ a: undefined } as never, {}), /not a JSON value/);
    assert.throws(() => diff({ a: Number.POSITIVE_INFINITY }, {}), /not a JSON value/);
    assert.throws(() => diff({ a: new Map() } as never, {}), /Map at "\/a"/);
    assert.doesNotThrow(() => diff(Object.create(null), {}));
  });

  it('changes() carries old values and formats them', () => {
    const list = changes(
      { name: 'old', age: 42, items: [1, 2] },
      { name: 'new', items: [1, 2, 3], ok: true },
    );
    assert.deepEqual(list, [
      { op: 'replace', path: '/name', value: 'new', oldValue: 'old' },
      { op: 'remove', path: '/age', oldValue: 42 },
      { op: 'add', path: '/items/2', value: 3 },
      { op: 'add', path: '/ok', value: true },
    ]);
    assert.equal(
      formatChanges(list),
      ['~ /name: "old" -> "new"', '- /age: 42', '+ /items/2: 3', '+ /ok: true', ''].join('\n'),
    );
    assert.equal(formatChanges([]), '');
  });

  it('formats moves, the root, colors, long values and control characters', () => {
    const moved = changes([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }], { objectHash: 'id' });
    assert.equal(formatChanges(moved), '> /0 -> /1 {"id":1}\n');
    assert.equal(formatChanges(changes(1, 2)), '~ (root): 1 -> 2\n');
    assert.equal(formatChanges(changes({}, { a: 1 }), { color: true }), '\u001b[32m+ /a: 1\u001b[0m\n');
    assert.equal(
      formatChanges(changes({}, { a: 'x'.repeat(100) }), { maxValueLength: 10 }),
      '+ /a: "xxxxxx...\n',
    );
    assert.equal(formatChanges(changes({}, { 'a\u001b[2J': 1 })), '+ /a\\u001b[2J: 1\n');
  });
});
