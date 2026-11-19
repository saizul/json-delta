import { JsonDeltaError } from './errors.js';
import type { JsonValue } from './types.js';
import { hasKey, isObject } from './value.js';

/** Escapes one reference token: `~` becomes `~0` and `/` becomes `~1` (RFC 6901). */
export function escapeToken(token: string | number): string {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Reverses `escapeToken()`. `~01` decodes to `~1`, not `/` (RFC 6901, section 4). */
export function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Splits a JSON Pointer into unescaped reference tokens. `''` is the whole
 * document and gives `[]`. Throws `INVALID_POINTER` for pointers that do not
 * start with `/` or contain a `~` not followed by `0` or `1`.
 */
export function parsePointer(pointer: string): string[] {
  if (typeof pointer !== 'string') {
    throw new JsonDeltaError('INVALID_POINTER', 'a JSON Pointer must be a string');
  }
  if (pointer === '') return [];
  if (pointer[0] !== '/') {
    throw new JsonDeltaError('INVALID_POINTER', `JSON Pointer "${pointer}" must start with "/"`, {
      path: pointer,
    });
  }
  if (/~(?![01])/.test(pointer)) {
    throw new JsonDeltaError(
      'INVALID_POINTER',
      `JSON Pointer "${pointer}" has a "~" not followed by 0 or 1`,
      {
        path: pointer,
      },
    );
  }
  return pointer.slice(1).split('/').map(unescapeToken);
}

/** Joins reference tokens into a JSON Pointer, escaping each one. */
export function formatPointer(tokens: readonly (string | number)[]): string {
  return tokens.map((t) => `/${escapeToken(t)}`).join('');
}

/** Appends one token to a pointer. */
export function appendPointer(pointer: string, token: string | number): string {
  return `${pointer}/${escapeToken(token)}`;
}

/**
 * Parses an array index token. RFC 6901 allows `0` or digits without a
 * leading zero; anything else returns `undefined`.
 */
export function parseIndex(token: string): number | undefined {
  return /^(0|[1-9][0-9]*)$/.test(token) ? Number(token) : undefined;
}

/** True when `pointer` points inside `parent` (or is `parent` itself). */
export function isPointerPrefix(parent: string, pointer: string): boolean {
  return pointer === parent || pointer.startsWith(`${parent}/`);
}

/** The value a pointer refers to, or `undefined` if there is none. */
export function getValue(document: JsonValue, pointer: string): JsonValue | undefined {
  let current: JsonValue | undefined = document;
  for (const token of parsePointer(pointer)) {
    if (Array.isArray(current)) {
      const index = parseIndex(token);
      current = index === undefined ? undefined : current[index];
    } else if (isObject(current)) {
      current = hasKey(current, token) ? current[token] : undefined;
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

/** True when the pointer refers to an existing value. */
export function hasValue(document: JsonValue, pointer: string): boolean {
  return getValue(document, pointer) !== undefined;
}
