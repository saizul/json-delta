import type { Change, JsonValue } from './types.js';

export interface FormatOptions {
  /** Use ANSI colors. Default false. */
  color?: boolean;
  /** Values longer than this are shortened with "...". Default 80; 0 for no limit. */
  maxValueLength?: number;
}

const COLORS = { add: 32, remove: 31, replace: 33, move: 36, dim: 2 } as const;

/** Replaces control characters so values and keys cannot drive the terminal. */
function clean(text: string): string {
  return text.replace(
    /[\u0000-\u001f\u007f-\u009f]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function show(value: JsonValue, max: number): string {
  const text = JSON.stringify(value);
  return max > 0 && text.length > max ? `${text.slice(0, Math.max(1, max - 3))}...` : text;
}

/**
 * Renders changes as one line each, like `diff -u` for JSON:
 *
 * ```text
 * ~ /name: "old" -> "new"
 * + /tags/2: "x"
 * - /age: 42
 * > /items/0 -> /items/3
 * ```
 */
export function formatChanges(list: readonly Change[], options: FormatOptions = {}): string {
  const max = options.maxValueLength ?? 80;
  const paint = (color: keyof typeof COLORS, text: string) =>
    options.color ? `\u001b[${COLORS[color]}m${text}\u001b[0m` : text;
  const lines = list.map((c) => {
    const path = clean(c.path === '' ? '(root)' : c.path);
    switch (c.op) {
      case 'add':
        return paint('add', `+ ${path}: ${show(c.value, max)}`);
      case 'remove':
        return paint('remove', `- ${path}: ${show(c.oldValue, max)}`);
      case 'replace':
        return paint('replace', `~ ${path}: ${show(c.oldValue, max)} -> ${show(c.value, max)}`);
      default:
        return paint('move', `> ${clean(c.from)} -> ${path}`) + paint('dim', ` ${show(c.value, max)}`);
    }
  });
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}
