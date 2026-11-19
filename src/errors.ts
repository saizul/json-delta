/** Error codes used by `JsonDeltaError`. */
export type ErrorCode =
  | 'INVALID_POINTER'
  | 'INVALID_PATCH'
  | 'INVALID_OPERATION'
  | 'PATH_NOT_FOUND'
  | 'INVALID_INDEX'
  | 'TEST_FAILED'
  | 'MOVE_INTO_CHILD'
  | 'NOT_JSON'
  | 'MERGE_NULL';

/** Every error thrown by json-delta. `code` is stable public API. */
export class JsonDeltaError extends Error {
  readonly code: ErrorCode;
  /** The JSON Pointer involved, when there is one. */
  readonly path: string | undefined;
  /** The zero-based index of the failing patch operation, when applying a patch. */
  readonly operationIndex: number | undefined;

  constructor(code: ErrorCode, message: string, details: { path?: string; operationIndex?: number } = {}) {
    super(message);
    this.name = 'JsonDeltaError';
    this.code = code;
    this.path = details.path;
    this.operationIndex = details.operationIndex;
  }
}
