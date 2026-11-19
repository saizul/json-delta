import { applyPatch, validatePatch } from '../apply.js';
import { changes, diff } from '../diff.js';
import { JsonDeltaError } from '../errors.js';
import { formatChanges } from '../format.js';
import { applyMergePatch, createMergePatch } from '../merge.js';
import { summarize } from '../summary.js';
import type { JsonValue } from '../types.js';
import { VERSION } from '../version.js';

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Reads a file as UTF-8 text; `-` means standard input. */
  readFile(path: string): string;
  /** Whether standard output is a terminal (enables colors). */
  isTTY?: boolean;
  env?: Record<string, string | undefined>;
}

const HELP = `Usage: json-delta [options] <a.json> <b.json>
       json-delta apply [options] <document.json> <patch.json>

Compare two JSON files and print what changed. Exits with code 1 when they
differ, so it works as a check in CI. Use "-" to read one file from stdin.

Output (pick one; default is a readable, colored list of changes):
  -p, --patch            print an RFC 6902 JSON Patch
  -m, --merge            print an RFC 7386 JSON Merge Patch
  -s, --summary          print counts per kind of change and the changed paths
  -q, --quiet            print nothing; only set the exit code

Diff options:
  -k, --object-hash <key>  match array items by this property (e.g. id) and
                           report moved items as "move" operations
      --invertible       add a "test" before every remove and replace
      --indent <N>       indentation of JSON output (default 2, 0 for one line)
      --color, --no-color  force colors on or off (default: on for a
                           terminal unless NO_COLOR is set)

apply:
  Applies a JSON Patch (an array) or a JSON Merge Patch (an object) to the
  document and prints the result. --merge forces merge-patch mode.

  -h, --help             show this help
  -v, --version          show the version

Examples:
  json-delta before.json after.json
  json-delta before.json after.json --patch --object-hash id > changes.patch.json
  json-delta apply before.json changes.patch.json > after.json
  curl -s https://example.com/api | json-delta expected.json -

Exit codes: 0 no differences (apply: success), 1 differences (apply: patch
failed), 2 usage, file or JSON syntax error.
`;

class UsageError extends Error {}

interface Args {
  command: 'diff' | 'apply';
  files: string[];
  mode: 'pretty' | 'patch' | 'merge' | 'summary' | 'quiet';
  objectHash?: string;
  invertible: boolean;
  indent: number;
  color?: boolean;
}

function parseArgs(argv: string[]): Args | 'help' | 'version' {
  const args: Args = { command: 'diff', files: [], mode: 'pretty', invertible: false, indent: 2 };
  const modes: Record<string, Args['mode']> = {
    '-p': 'patch',
    '--patch': 'patch',
    '-m': 'merge',
    '--merge': 'merge',
    '-s': 'summary',
    '--summary': 'summary',
    '-q': 'quiet',
    '--quiet': 'quiet',
  };
  let modeFlag: string | undefined;
  let onlyFiles = false;
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]!;
    let inline: string | undefined;
    if (!onlyFiles && arg.startsWith('--') && arg.includes('=')) {
      inline = arg.slice(arg.indexOf('=') + 1);
      arg = arg.slice(0, arg.indexOf('='));
    }
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined) throw new UsageError(`${arg} needs a value`);
      return next;
    };
    if (onlyFiles || arg === '-' || !arg.startsWith('-')) {
      if (args.files.length === 0 && arg === 'apply' && args.command === 'diff' && !onlyFiles) {
        args.command = 'apply';
      } else {
        args.files.push(arg);
      }
      continue;
    }
    if (arg === '--') onlyFiles = true;
    else if (arg === '-h' || arg === '--help') return 'help';
    else if (arg === '-v' || arg === '--version') return 'version';
    else if (modes[arg]) {
      if (modeFlag && modes[modeFlag] !== modes[arg]) {
        throw new UsageError(`${modeFlag} and ${arg} cannot be used together`);
      }
      modeFlag = arg;
      args.mode = modes[arg]!;
    } else if (arg === '-k' || arg === '--object-hash') {
      args.objectHash = value();
      if (args.objectHash === '') throw new UsageError('--object-hash needs a property name');
    } else if (arg === '--invertible') args.invertible = true;
    else if (arg === '--indent') {
      const text = value();
      if (!/^\d+$/.test(text) || Number(text) > 10)
        throw new UsageError('--indent must be a number from 0 to 10');
      args.indent = Number(text);
    } else if (arg === '--color') args.color = true;
    else if (arg === '--no-color') args.color = false;
    else throw new UsageError(`unknown option "${arg}"`);
  }
  if (args.files.length !== 2) {
    throw new UsageError(
      args.command === 'apply'
        ? 'apply needs a document and a patch file'
        : 'expected two JSON files to compare',
    );
  }
  if (args.files[0] === '-' && args.files[1] === '-')
    throw new UsageError('only one file can be read from stdin');
  if (args.command === 'apply' && (args.mode === 'patch' || args.mode === 'summary')) {
    throw new UsageError(`${modeFlag} cannot be used with apply`);
  }
  return args;
}

/** Replaces control characters in file names before printing them. */
function clean(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');
}

function load(io: CliIO, path: string): JsonValue {
  const name = path === '-' ? 'stdin' : path;
  let text: string;
  try {
    text = io.readFile(path);
  } catch (err) {
    const code = (err as { code?: string }).code;
    throw new Error(`cannot read ${clean(name)}${code ? ` (${code})` : ''}`);
  }
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as JsonValue;
  } catch (err) {
    throw new Error(`${clean(name)} is not valid JSON: ${(err as Error).message}`);
  }
}

function useColor(args: Args, io: CliIO): boolean {
  if (args.color !== undefined) return args.color;
  const env = io.env ?? {};
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
  return Boolean(io.isTTY);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Runs the CLI and returns the exit code. All I/O goes through `io`. */
export function run(argv: string[], io: CliIO): number {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.stderr(`json-delta: ${err.message}\nTry "json-delta --help".\n`);
    return 2;
  }
  if (args === 'help') {
    io.stdout(HELP);
    return 0;
  }
  if (args === 'version') {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  let a: JsonValue;
  let b: JsonValue;
  try {
    a = load(io, args.files[0]!);
    b = load(io, args.files[1]!);
  } catch (err) {
    io.stderr(`json-delta: ${(err as Error).message}\n`);
    return 2;
  }
  const json = (value: unknown) => `${JSON.stringify(value, null, args.indent || undefined)}\n`;

  if (args.command === 'apply') {
    try {
      const merge = args.mode === 'merge' || !Array.isArray(b);
      if (!merge) validatePatch(b);
      const result = merge ? applyMergePatch(a, b) : applyPatch(a, b as never);
      if (args.mode !== 'quiet') io.stdout(json(result));
      return 0;
    } catch (err) {
      if (!(err instanceof JsonDeltaError)) throw err;
      io.stderr(`json-delta: ${clean(err.message)} [${err.code}]\n`);
      return err.code === 'INVALID_PATCH' ||
        err.code === 'INVALID_OPERATION' ||
        err.code === 'INVALID_POINTER'
        ? 2
        : 1;
    }
  }

  const options = args.objectHash === undefined ? {} : { objectHash: args.objectHash };
  const list = changes(a, b, options);
  const differ = list.length > 0;
  switch (args.mode) {
    case 'quiet':
      break;
    case 'patch':
      io.stdout(json(diff(a, b, { ...options, invertible: args.invertible })));
      break;
    case 'merge':
      try {
        io.stdout(json(differ ? createMergePatch(a, b) : {}));
      } catch (err) {
        if (!(err instanceof JsonDeltaError)) throw err;
        io.stderr(`json-delta: ${clean(err.message)} [${err.code}]\n`);
        return 2;
      }
      break;
    case 'summary': {
      if (!differ) {
        io.stdout('No differences\n');
        break;
      }
      const s = summarize(list);
      const counts = [
        `${s.add} added`,
        `${s.remove} removed`,
        `${s.replace} changed`,
        ...(s.move ? [`${s.move} moved`] : []),
      ];
      io.stdout(`${plural(s.total, 'change')}: ${counts.join(', ')}\n`);
      for (const p of s.paths) io.stdout(`  ${clean(p === '' ? '(root)' : p)}\n`);
      break;
    }
    case 'pretty':
      io.stdout(formatChanges(list, { color: useColor(args, io) }));
      break;
  }
  return differ ? 1 : 0;
}
