#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from './cli/run.js';

try {
  process.exitCode = run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readFile: (path) => readFileSync(path === '-' ? 0 : path, 'utf8'),
    isTTY: Boolean(process.stdout.isTTY),
    env: process.env,
  });
} catch (err) {
  process.stderr.write(`json-delta: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
}
