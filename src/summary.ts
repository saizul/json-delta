import type { Change, Operation } from './types.js';

export interface Summary {
  /** Number of operations per kind. */
  add: number;
  remove: number;
  replace: number;
  move: number;
  copy: number;
  test: number;
  /** All operations except `test`. */
  total: number;
  /** The changed paths in patch order, without duplicates. */
  paths: string[];
}

/** Counts the operations in a patch (or a list of changes) by kind. */
export function summarize(patch: readonly (Operation | Change)[]): Summary {
  const summary: Summary = { add: 0, remove: 0, replace: 0, move: 0, copy: 0, test: 0, total: 0, paths: [] };
  const seen = new Set<string>();
  for (const op of patch) {
    summary[op.op]++;
    if (op.op === 'test') continue;
    summary.total++;
    if (!seen.has(op.path)) {
      seen.add(op.path);
      summary.paths.push(op.path);
    }
  }
  return summary;
}
