import { appendPointer } from './pointer.js';
import type { Change, DiffOptions, JsonPatch, JsonValue, ObjectHash } from './types.js';
import { assertJson, canonical, clone, deepEqual, hasKey, isObject } from './value.js';

const DEFAULT_MAX_LCS_CELLS = 4_000_000;

interface Context {
  hash: ObjectHash | undefined;
  maxCells: number;
  out: Change[];
}

function toHash(objectHash: DiffOptions['objectHash']): ObjectHash | undefined {
  if (objectHash === undefined) return undefined;
  if (typeof objectHash === 'function') return objectHash;
  if (typeof objectHash !== 'string' || objectHash === '') {
    throw new TypeError('objectHash must be a property name or a function');
  }
  const key = objectHash;
  return (item) => {
    if (!isObject(item) || !hasKey(item, key)) return undefined;
    const id = item[key]!;
    return typeof id === 'string' || typeof id === 'number' ? id : canonical(id);
  };
}

/**
 * Lists the changes that turn `a` into `b`, in the order a patch would apply
 * them. Each change carries the old value. `diff()` is this list as RFC 6902
 * operations.
 */
export function changes(a: JsonValue, b: JsonValue, options: DiffOptions = {}): Change[] {
  assertJson(a);
  assertJson(b);
  const ctx: Context = {
    hash: toHash(options.objectHash),
    maxCells: options.maxLcsCells ?? DEFAULT_MAX_LCS_CELLS,
    out: [],
  };
  walk(a, b, '', ctx);
  return ctx.out;
}

/**
 * Computes an RFC 6902 JSON Patch that turns `a` into `b`:
 * `applyPatch(a, diff(a, b))` deep-equals `b`. Returns `[]` when the values
 * are equal.
 */
export function diff(a: JsonValue, b: JsonValue, options: DiffOptions = {}): JsonPatch {
  const patch: JsonPatch = [];
  for (const c of changes(a, b, options)) {
    switch (c.op) {
      case 'add':
        patch.push({ op: 'add', path: c.path, value: clone(c.value) });
        break;
      case 'remove':
        if (options.invertible) patch.push({ op: 'test', path: c.path, value: clone(c.oldValue) });
        patch.push({ op: 'remove', path: c.path });
        break;
      case 'replace':
        if (options.invertible) patch.push({ op: 'test', path: c.path, value: clone(c.oldValue) });
        patch.push({ op: 'replace', path: c.path, value: clone(c.value) });
        break;
      case 'move':
        patch.push({ op: 'move', from: c.from, path: c.path });
        break;
    }
  }
  return patch;
}

function walk(a: JsonValue, b: JsonValue, path: string, ctx: Context): void {
  if (deepEqual(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (ctx.hash) diffArrayByHash(a, b, path, ctx, ctx.hash);
    else diffArrayByValue(a, b, path, ctx);
    return;
  }
  if (isObject(a) && isObject(b)) {
    for (const key of Object.keys(a)) {
      const child = appendPointer(path, key);
      if (!hasKey(b, key)) ctx.out.push({ op: 'remove', path: child, oldValue: a[key]! });
      else walk(a[key]!, b[key]!, child, ctx);
    }
    for (const key of Object.keys(b)) {
      if (!hasKey(a, key)) ctx.out.push({ op: 'add', path: appendPointer(path, key), value: b[key]! });
    }
    return;
  }
  ctx.out.push({ op: 'replace', path, value: b, oldValue: a });
}

/**
 * Longest common subsequence of two key lists, as index pairs. Common
 * prefixes and suffixes are matched first; past `maxCells` the middle is left
 * unmatched (compared by position).
 */
function lcs(a: readonly string[], b: readonly string[], maxCells: number): [number, number][] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  const n = endA - start;
  const m = endB - start;
  if (n > 0 && m > 0 && n * m <= maxCells) {
    // lengths[i][j] = LCS length of a[start+i..endA) and b[start+j..endB)
    const width = m + 1;
    const lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lengths[i * width + j] =
          a[start + i] === b[start + j]
            ? lengths[(i + 1) * width + j + 1]! + 1
            : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) {
        i++;
      } else {
        j++;
      }
    }
  }
  for (let k = 0; endA + k < a.length; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

/** Arrays without an identity: keep the common subsequence, patch the gaps. */
function diffArrayByValue(a: JsonValue[], b: JsonValue[], path: string, ctx: Context): void {
  const pairs = lcs(a.map(canonical), b.map(canonical), ctx.maxCells);
  pairs.push([a.length, b.length]);
  let i = 0;
  let j = 0;
  for (const [ai, bj] of pairs) {
    // Gap a[i..ai) became b[j..bj). In the patched array a[i] now sits at j.
    const removed = ai - i;
    const added = bj - j;
    const paired = Math.min(removed, added);
    for (let k = 0; k < paired; k++) walk(a[i + k]!, b[j + k]!, appendPointer(path, j + k), ctx);
    for (let k = paired; k < removed; k++) {
      ctx.out.push({ op: 'remove', path: appendPointer(path, j + paired), oldValue: a[i + k]! });
    }
    for (let k = paired; k < added; k++) {
      ctx.out.push({ op: 'add', path: appendPointer(path, j + k), value: b[j + k]! });
    }
    i = ai + 1;
    j = bj + 1;
  }
}

/** Gives every item a unique key; repeated identities get an occurrence suffix. */
function keysOf(items: JsonValue[], hash: ObjectHash): string[] {
  const seen = new Map<string, number>();
  return items.map((item, index) => {
    const id = hash(item, index);
    const base = id === undefined || id === null ? `v:${canonical(item)}` : `${typeof id}:${id}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

/**
 * Arrays with an identity: remove items that are gone, then build the target
 * order left to right. Items on the longest common subsequence stay put;
 * every other item is added or moved to just after its new predecessor.
 * Finally items that were kept but changed are patched at their new index.
 */
function diffArrayByHash(a: JsonValue[], b: JsonValue[], path: string, ctx: Context, hash: ObjectHash): void {
  const keysA = keysOf(a, hash);
  const keysB = keysOf(b, hash);
  const indexA = new Map(keysA.map((k, i) => [k, i]));
  const inB = new Set(keysB);

  // 1. Removals, from the end so earlier indices stay valid.
  for (let i = a.length - 1; i >= 0; i--) {
    if (!inB.has(keysA[i]!)) ctx.out.push({ op: 'remove', path: appendPointer(path, i), oldValue: a[i]! });
  }
  const current = keysA.filter((k) => inB.has(k));
  const kept = new Set(keysB.filter((k) => indexA.has(k)));
  const target = keysB.filter((k) => kept.has(k));
  const stay = new Set(lcs(current, target, Number.POSITIVE_INFINITY).map(([i]) => current[i]!));

  // 2. Adds and moves in target order.
  for (let j = 0; j < keysB.length; j++) {
    const key = keysB[j]!;
    if (stay.has(key)) continue;
    let from = -1;
    if (kept.has(key)) {
      from = current.indexOf(key);
      current.splice(from, 1);
    }
    const to = j === 0 ? 0 : current.indexOf(keysB[j - 1]!) + 1;
    current.splice(to, 0, key);
    if (from === -1) {
      ctx.out.push({ op: 'add', path: appendPointer(path, to), value: b[j]! });
    } else if (from !== to) {
      ctx.out.push({
        op: 'move',
        from: appendPointer(path, from),
        path: appendPointer(path, to),
        value: a[indexA.get(key)!]!,
      });
    }
  }

  // 3. Changed values of kept items, now in their final position.
  for (let j = 0; j < keysB.length; j++) {
    const i = indexA.get(keysB[j]!);
    if (i !== undefined) walk(a[i]!, b[j]!, appendPointer(path, j), ctx);
  }
}
