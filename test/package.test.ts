import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import * as esm from '../src/index.js';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('package', () => {
  it('the CommonJS build exposes the same API', () => {
    const cjs = require('../cjs/index.js') as typeof esm;
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    assert.deepEqual(cjs.diff({ a: 1 }, { a: 2 }), [{ op: 'replace', path: '/a', value: 2 }]);
  });

  it('the CommonJS folder is marked as commonjs', () => {
    assert.equal(JSON.parse(read('../cjs/package.json')).type, 'commonjs');
  });

  it('has no runtime dependencies and versions agree', () => {
    const pkg = JSON.parse(read('../../package.json'));
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.version, esm.VERSION);
    assert.equal(pkg.name, '@saizul/json-delta');
    assert.equal(pkg.bin['json-delta'], './dist/esm/cli.js');
  });

  it('the CLI entry starts with a shebang', () => {
    assert.ok(read('../esm/cli.js').startsWith('#!/usr/bin/env node'));
  });

  it('the README documents every error code', () => {
    const readme = read('../../README.md');
    const codes = [
      'INVALID_POINTER',
      'INVALID_PATCH',
      'INVALID_OPERATION',
      'PATH_NOT_FOUND',
      'INVALID_INDEX',
      'TEST_FAILED',
      'MOVE_INTO_CHILD',
      'NOT_JSON',
      'MERGE_NULL',
    ];
    for (const code of codes) assert.ok(readme.includes(`\`${code}\``), code);
  });

  it('the README documents every export', () => {
    const readme = read('../../README.md');
    for (const name of Object.keys(esm)) assert.ok(readme.includes(`\`${name}`), name);
  });
});
