import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VERSION } from '../src/index.js';
import { cli } from './helpers.js';

const A = 'examples/before.json';
const B = 'examples/after.json';

describe('cli', () => {
  it('prints help and version', () => {
    const help = cli(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage: json-delta \[options\] <a\.json> <b\.json>/);
    assert.equal(cli(['-v']).stdout, `${VERSION}\n`);
  });

  it('prints readable changes and exits 1 when files differ', () => {
    const r = cli([A, B, '--object-hash', 'id']);
    assert.equal(r.code, 1);
    assert.equal(
      r.stdout,
      [
        '~ /version: "1.4.0" -> "1.5.0"',
        '- /features/beta: true',
        '+ /features/export: true',
        '> /0 -> /2 {"id":1,"name":"Ada","role":"admin"}'.replace('/0', '/users/0').replace('/2', '/users/2'),
        '+ /users/3: {"id":4,"name":"Barbara","role":"dev"}',
        '~ /users/1/role: "dev" -> "admin"',
        '',
      ].join('\n'),
    );
  });

  it('exits 0 with no output for equal files', () => {
    const r = cli(['x.json', 'y.json'], {
      'x.json': '{"a":[1,{"b":2}]}',
      'y.json': '{ "a": [1, {"b": 2}] }',
    });
    assert.deepEqual(r, { code: 0, stdout: '', stderr: '' });
  });

  it('prints a JSON Patch that apply turns back into the second file', () => {
    const r = cli([A, B, '--patch', '-k', 'id']);
    assert.equal(r.code, 1);
    const patch = JSON.parse(r.stdout);
    assert.equal(patch.length, 6);
    const applied = cli(['apply', A, 'patch.json'], { 'patch.json': r.stdout });
    assert.equal(applied.code, 0);
    assert.deepEqual(
      JSON.parse(applied.stdout),
      JSON.parse(cli(['apply', B, 'e.json'], { 'e.json': '[]' }).stdout),
    );
  });

  it('prints --patch with --invertible and --indent 0 on one line', () => {
    const r = cli(['a', 'b', '--patch', '--invertible', '--indent=0'], { a: '{"x":1}', b: '{"x":2}' });
    assert.equal(r.stdout, '[{"op":"test","path":"/x","value":1},{"op":"replace","path":"/x","value":2}]\n');
  });

  it('prints a merge patch', () => {
    const r = cli([A, B, '--merge', '--indent', '0']);
    assert.equal(r.code, 1);
    const patch = JSON.parse(r.stdout);
    assert.equal(patch.version, '1.5.0');
    assert.deepEqual(patch.features, { beta: null, export: true });
    assert.equal(cli(['a', 'b', '-m'], { a: '{"x":1}', b: '{"x":1}' }).stdout, '{}\n');
  });

  it('explains when a merge patch cannot express the change', () => {
    const r = cli(['a', 'b', '--merge'], { a: '{"x":1}', b: '{"x":null}' });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /cannot set "\/x" to null.*\[MERGE_NULL\]/);
  });

  it('prints a summary', () => {
    const r = cli([A, B, '--summary', '-k', 'id']);
    assert.equal(r.code, 1);
    assert.equal(
      r.stdout,
      [
        '6 changes: 2 added, 1 removed, 2 changed, 1 moved',
        '  /version',
        '  /features/beta',
        '  /features/export',
        '  /users/2',
        '  /users/3',
        '  /users/1/role',
        '',
      ].join('\n'),
    );
    assert.equal(cli(['a', 'b', '-s'], { a: '1', b: '1' }).stdout, 'No differences\n');
    assert.equal(
      cli(['a', 'b', '-s'], { a: '1', b: '2' }).stdout,
      '1 change: 0 added, 0 removed, 1 changed\n  (root)\n',
    );
  });

  it('is silent with --quiet', () => {
    assert.deepEqual(cli([A, B, '-q']), { code: 1, stdout: '', stderr: '' });
  });

  it('colors output on a terminal unless NO_COLOR is set', () => {
    const files = { a: '{}', b: '{"x":1}' };
    assert.equal(cli(['a', 'b'], files, { isTTY: true }).stdout, '\u001b[32m+ /x: 1\u001b[0m\n');
    assert.equal(cli(['a', 'b'], files, { isTTY: true, env: { NO_COLOR: '1' } }).stdout, '+ /x: 1\n');
    assert.equal(
      cli(['a', 'b'], files, { env: { FORCE_COLOR: '1' } }).stdout,
      '\u001b[32m+ /x: 1\u001b[0m\n',
    );
    assert.equal(cli(['a', 'b', '--color'], files).stdout, '\u001b[32m+ /x: 1\u001b[0m\n');
    assert.equal(cli(['a', 'b', '--no-color'], files, { isTTY: true }).stdout, '+ /x: 1\n');
  });

  it('reads stdin as "-" and strips a byte order mark', () => {
    const r = cli(['-', 'b'], { '-': '﻿{"x":1}', b: '{"x":1}' });
    assert.equal(r.code, 0);
  });

  it('applies a merge patch, or a JSON Patch with --merge forced off by type', () => {
    const r = cli(['apply', 'doc', 'mp'], { doc: '{"a":1,"b":2}', mp: '{"b":null,"c":3}' });
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.stdout), { a: 1, c: 3 });
    const forced = cli(['apply', 'doc', 'mp', '--merge'], { doc: '{"a":1}', mp: '[1]' });
    assert.deepEqual(JSON.parse(forced.stdout), [1]);
  });

  it('reports failed patches with exit code 1 and bad patches with 2', () => {
    const failed = cli(['apply', 'doc', 'p'], { doc: '{"a":1}', p: '[{"op":"test","path":"/a","value":2}]' });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /test failed at "\/a": expected 2, found 1 \[TEST_FAILED\]/);
    const bad = cli(['apply', 'doc', 'p'], { doc: '{}', p: '[{"op":"jump","path":"/a"}]' });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /\[INVALID_OPERATION\]/);
  });

  it('rejects usage, file and JSON errors with exit code 2', () => {
    const cases: [string[], RegExp][] = [
      [[], /expected two JSON files/],
      [['a'], /expected two JSON files/],
      [['a', 'b', 'c'], /expected two JSON files/],
      [['apply', 'a'], /apply needs a document and a patch file/],
      [['-', '-'], /only one file can be read from stdin/],
      [['a', 'b', '--bogus'], /unknown option "--bogus"/],
      [['a', 'b', '--patch', '--merge'], /--patch and --merge cannot be used together/],
      [['a', 'b', '-k'], /-k needs a value/],
      [['a', 'b', '--object-hash='], /needs a property name/],
      [['a', 'b', '--indent', 'x'], /--indent must be a number/],
      [['apply', 'a', 'b', '--summary'], /--summary cannot be used with apply/],
      [['missing.json', 'b'], /cannot read missing\.json \(ENOENT\)/],
      [['bad', 'b'], /bad is not valid JSON/],
    ];
    for (const [args, message] of cases) {
      const r = cli(args, { bad: '{nope', b: '{}', a: '{}' });
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, message, args.join(' '));
    }
  });

  it('treats arguments after -- as files', () => {
    const r = cli(['--', '-a', 'apply'], { '-a': '1', apply: '1' });
    assert.equal(r.code, 0);
  });
});
