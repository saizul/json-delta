import { JsonDeltaError } from './errors.js';
import type { JsonObject, JsonValue } from './types.js';

const hasOwn = (obj: object, key: string) => Object.hasOwn(obj, key);

/** True for JSON objects (not arrays, not null). */
export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property lookup that never reads from the prototype chain. */
export function hasKey(obj: JsonObject, key: string): boolean {
  return hasOwn(obj, key);
}

/**
 * Sets an own property. Plain assignment of `__proto__` would change the
 * object's prototype instead of creating a member, so define it.
 */
export function setKey(obj: JsonObject, key: string, value: JsonValue): void {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    obj[key] = value;
  }
}

/** Deep equality with JSON semantics: object key order does not matter. */
export function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i]!, b[i]!)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!hasOwn(b, key) || !deepEqual(a[key]!, b[key]!)) return false;
  }
  return true;
}

/** Deep copy of a JSON value. */
export function clone<T extends JsonValue>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  const out: JsonObject = {};
  for (const key of Object.keys(value)) setKey(out, key, clone(value[key]!));
  return out as T;
}

/** JSON text with object keys sorted, so equal values give equal strings. */
export function canonical(value: JsonValue): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k]!)}`).join(',')}}`;
}

/**
 * Throws `NOT_JSON` when the value cannot be represented as JSON: undefined,
 * functions, symbols, bigints, non-finite numbers, or class instances such as
 * Date and Map.
 */
export function assertJson(value: unknown, path = ''): asserts value is JsonValue {
  const fail = (what: string): never => {
    throw new JsonDeltaError('NOT_JSON', `${what} at "${path}" is not a JSON value`, { path });
  };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(String(value));
    return;
  }
  if (typeof value !== 'object') return fail(typeof value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertJson(value[i], `${path}/${i}`);
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(proto?.constructor?.name ?? 'object');
  for (const key of Object.keys(value)) {
    assertJson(
      (value as Record<string, unknown>)[key],
      `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    );
  }
}
