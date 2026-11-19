import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyMergePatch, applyPatch, createMergePatch, diff, type JsonValue } from '../src/index.js';

/** Small seeded PRNG (mulberry32) so failures are reproducible. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(rand: () => number, depth: number, allowNull = true): JsonValue {
  const r = rand();
  if (depth <= 0 || r < 0.35) {
    const p = rand();
    if (p < 0.15 && allowNull) return null;
    if (p < 0.3) return rand() < 0.5;
    if (p < 0.65) return Math.floor(rand() * 5);
    return ['a', 'b', 'c', '', 'a/b', '~'][Math.floor(rand() * 6)]!;
  }
  if (r < 0.7) {
    return Array.from({ length: Math.floor(rand() * 6) }, () =>
      rand() < 0.5
        ? { id: Math.floor(rand() * 6), v: generate(rand, depth - 1, allowNull) }
        : generate(rand, depth - 1, allowNull),
    );
  }
  const out: Record<string, JsonValue> = {};
  for (const key of ['a', 'b', 'c', '~0', 'x/y', 'id'])
    if (rand() < 0.45) out[key] = generate(rand, depth - 1, allowNull);
  return out;
}

/** Mutates a value a little, so pairs share structure like real documents do. */
function mutate(rand: () => number, value: JsonValue, depth: number): JsonValue {
  if (rand() < 0.15) return generate(rand, depth);
  if (Array.isArray(value)) {
    const out = value.map((v) => (rand() < 0.3 ? mutate(rand, v, depth - 1) : v));
    if (rand() < 0.3 && out.length > 0) out.splice(Math.floor(rand() * out.length), 1);
    if (rand() < 0.3) out.splice(Math.floor(rand() * (out.length + 1)), 0, generate(rand, depth - 1));
    if (rand() < 0.3 && out.length > 1) out.reverse();
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      if (rand() < 0.15) continue;
      out[k] = rand() < 0.4 ? mutate(rand, v, depth - 1) : v;
    }
    if (rand() < 0.3) out.z = generate(rand, depth - 1);
    return out;
  }
  return value;
}

describe('fuzz', () => {
  it('applyPatch(a, diff(a, b)) equals b for 3,000 random pairs', () => {
    const rand = random(42);
    for (let n = 0; n < 1000; n++) {
      const a = generate(rand, 4);
      const b = mutate(rand, a, 4);
      for (const options of [{}, { objectHash: 'id' }, { invertible: true }]) {
        const patch = diff(a, b, options);
        assert.deepEqual(applyPatch(a, patch), b, `seed 42 case ${n} ${JSON.stringify(options)}`);
        // Applying the patch over the JSON wire format works too.
        assert.deepEqual(applyPatch(a, JSON.parse(JSON.stringify(patch))), b);
      }
      assert.deepEqual(diff(a, a), []);
    }
  });

  it('applyMergePatch(a, createMergePatch(a, b)) equals b when b has no null members', () => {
    const rand = random(7);
    for (let n = 0; n < 1000; n++) {
      const a = generate(rand, 4);
      const b = generate(rand, 4, false);
      assert.deepEqual(applyMergePatch(a, createMergePatch(a, b)), b, `case ${n}`);
    }
  });
});
