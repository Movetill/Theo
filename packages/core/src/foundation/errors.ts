export type ErrorCode =
  | 'INVALID_SCHEMA' | 'INVALID_BIT_VECTOR' | 'OUT_OF_RANGE'
  | 'DUPLICATE_ID' | 'UNKNOWN_REFERENCE' | 'WIDTH_MISMATCH' | 'SIGNEDNESS_MISMATCH'
  | 'INVALID_NODE_BINDINGS' | 'INVALID_DRIVER' | 'COMBINATIONAL_CYCLE'
  | 'UNSUPPORTED_CLOCKING' | 'RESOURCE_LIMIT' | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSUPPORTED_SEMANTICS'
  | 'REFERENCE_ERROR' | 'INVALID_JSON' | 'NOT_FOUND' | 'REVISION_CONFLICT'
  | 'UNSAFE_WORKSPACE_PATH' | 'WORKSPACE_CORRUPT'

export interface Diagnostic { code: ErrorCode; message: string; path: string }

export class CoreError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly path = '$') {
    super(message)
    this.name = 'CoreError'
  }
  toJSON(): Diagnostic { return { code: this.code, message: this.message, path: this.path } }
}
