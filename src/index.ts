export { applyOperation, applyPatch, validatePatch } from './apply.js';
export { changes, diff } from './diff.js';
export { type ErrorCode, JsonDeltaError } from './errors.js';
export { type FormatOptions, formatChanges } from './format.js';
export { applyMergePatch, createMergePatch } from './merge.js';
export {
  appendPointer,
  escapeToken,
  formatPointer,
  getValue,
  hasValue,
  isPointerPrefix,
  parseIndex,
  parsePointer,
  unescapeToken,
} from './pointer.js';
export { type Summary, summarize } from './summary.js';
export type {
  AddOperation,
  ApplyOptions,
  Change,
  CopyOperation,
  DiffOptions,
  JsonObject,
  JsonPatch,
  JsonValue,
  MoveOperation,
  ObjectHash,
  Operation,
  RemoveOperation,
  ReplaceOperation,
  TestOperation,
} from './types.js';
export { canonical, clone, deepEqual } from './value.js';
export { VERSION } from './version.js';
