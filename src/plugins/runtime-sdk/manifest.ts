import type {
  PsmPluginManifest,
  PsmPermission,
  PsmRecordIndexType,
  PsmRecordScope,
} from './types'

const SUPPORTED_PERMISSIONS = new Set<PsmPermission>([
  'sessions:read',
  'records:read',
  'records:write',
  'search:read',
  'kanban:read',
  'kanban:write',
  'sidechat:ask',
  'model:invoke',
])

const SUPPORTED_SCOPES = new Set<PsmRecordScope>([
  'session',
  'project',
  'global',
  'entry',
])

const SUPPORTED_INDEX_TYPES = new Set<PsmRecordIndexType>([
  'text',
  'number',
  'datetime',
  'boolean',
])

export interface ManifestValidationResult {
  ok: boolean
  errors: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isJsonPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('$.')
}

export function validatePsmPluginManifest(input: unknown): ManifestValidationResult {
  const errors: string[] = []

  if (!isObject(input)) {
    return { ok: false, errors: ['manifest must be an object'] }
  }

  if (!isNonEmptyString(input.id)) errors.push('id is required')
  if (!isNonEmptyString(input.name)) errors.push('name is required')
  if (!isNonEmptyString(input.version)) errors.push('version is required')

  const permissions = input.permissions
  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) {
      errors.push('permissions must be an array')
    } else {
      permissions.forEach((permission, index) => {
        if (!SUPPORTED_PERMISSIONS.has(permission as PsmPermission)) {
          errors.push(`permissions[${index}] is not supported`)
        }
      })
    }
  }

  const records = input.records
  if (records !== undefined) {
    if (!Array.isArray(records)) {
      errors.push('records must be an array')
    } else {
      records.forEach((record, recordIndex) => {
        if (!isObject(record)) {
          errors.push(`records[${recordIndex}] must be an object`)
          return
        }

        if (!isNonEmptyString(record.type)) {
          errors.push(`records[${recordIndex}].type is required`)
        }

        if (!SUPPORTED_SCOPES.has(record.scope as PsmRecordScope)) {
          errors.push(`records[${recordIndex}].scope is required`)
        }

        if (typeof record.schemaVersion !== 'number' || record.schemaVersion < 1) {
          errors.push(`records[${recordIndex}].schemaVersion must be >= 1`)
        }

        if (record.searchable !== undefined && !Array.isArray(record.searchable)) {
          errors.push(`records[${recordIndex}].searchable must be an array`)
        }

        if (record.indexes !== undefined) {
          if (!Array.isArray(record.indexes)) {
            errors.push(`records[${recordIndex}].indexes must be an array`)
          } else {
            record.indexes.forEach((indexDecl, indexPosition) => {
              if (!isObject(indexDecl)) {
                errors.push(`records[${recordIndex}].indexes[${indexPosition}] must be an object`)
                return
              }

              if (!isNonEmptyString(indexDecl.name)) {
                errors.push(`records[${recordIndex}].indexes[${indexPosition}].name is required`)
              }

              if (!isJsonPath(indexDecl.path)) {
                errors.push(`records[${recordIndex}].indexes[${indexPosition}].path must be a JSON path`)
              }

              if (!SUPPORTED_INDEX_TYPES.has(indexDecl.type as PsmRecordIndexType)) {
                errors.push(`records[${recordIndex}].indexes[${indexPosition}].type is not supported`)
              }
            })
          }
        }
      })
    }
  }

  return { ok: errors.length === 0, errors }
}

export function assertPsmPluginManifest(input: unknown): PsmPluginManifest {
  const result = validatePsmPluginManifest(input)
  if (!result.ok) {
    throw new Error(`Invalid PSM plugin manifest: ${result.errors.join('; ')}`)
  }
  return input as PsmPluginManifest
}
