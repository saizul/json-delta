/** Any value that JSON can represent. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/** RFC 6902 `add`. */
export interface AddOperation {
  op: 'add';
  path: string;
  value: JsonValue;
}

/** RFC 6902 `remove`. */
export interface RemoveOperation {
  op: 'remove';
  path: string;
}

/** RFC 6902 `replace`. */
export interface ReplaceOperation {
  op: 'replace';
  path: string;
  value: JsonValue;
}

/** RFC 6902 `move`. */
export interface MoveOperation {
  op: 'move';
  from: string;
  path: string;
}

/** RFC 6902 `copy`. */
export interface CopyOperation {
  op: 'copy';
  from: string;
  path: string;
}

/** RFC 6902 `test`. */
export interface TestOperation {
  op: 'test';
  path: string;
  value: JsonValue;
}

/** One RFC 6902 JSON Patch operation. */
export type Operation =
  | AddOperation
  | RemoveOperation
  | ReplaceOperation
  | MoveOperation
  | CopyOperation
  | TestOperation;

/** An RFC 6902 JSON Patch document: a list of operations applied in order. */
export type JsonPatch = Operation[];

/**
 * One change found by `changes()`. Unlike a bare patch operation it carries
 * the old value, which is handy for showing a human-readable diff.
 */
export type Change =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'remove'; path: string; oldValue: JsonValue }
  | { op: 'replace'; path: string; value: JsonValue; oldValue: JsonValue }
  | { op: 'move'; from: string; path: string; value: JsonValue };

/**
 * Returns an identity for an array item so items can be matched across the
 * two arrays even when they moved or changed. Return `undefined` to fall back
 * to comparing the whole value.
 */
export type ObjectHash = (item: JsonValue, index: number) => string | number | undefined | null;

export interface DiffOptions {
  /**
   * How to identify array items. A string is a property name (for example
   * `'id'`): objects are matched by that property, other items by value. A
   * function returns any identity you like. With an identity, items that
   * changed are patched in place and items that changed position become
   * `move` operations. Without one, arrays are compared by value (longest
   * common subsequence) and there are no moves.
   */
  objectHash?: string | ObjectHash;
  /**
   * Put a `test` operation with the old value before every `remove` and
   * `replace`, so applying the patch to the wrong document fails instead of
   * silently doing something else. Default false.
   */
  invertible?: boolean;
  /**
   * Arrays whose lengths multiply to more than this are compared position by
   * position instead of with the O(n*m) longest common subsequence. Default
   * 4,000,000 (for example two arrays of 2,000 items).
   */
  maxLcsCells?: number;
}

export interface ApplyOptions {
  /**
   * Change the given document in place instead of working on a copy. Faster,
   * but if an operation fails the document is left half-patched. Default false.
   */
  mutate?: boolean;
}
