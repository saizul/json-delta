import { readFileSync } from 'node:fs';
import { run } from '../src/cli/run.js';

/** Runs the CLI in-process with in-memory files and captures its output. */
export function cli(
  args: string[],
  files: Record<string, string> = {},
  extra: { isTTY?: boolean; env?: Record<string, string> } = {},
) {
  let stdout = '';
  let stderr = '';
  const code = run(args, {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    readFile: (path) => {
      if (path in files) return files[path]!;
      if (path.startsWith('examples/'))
        return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    },
    isTTY: extra.isTTY ?? false,
    env: extra.env ?? {},
  });
  return { code, stdout, stderr };
}
