/**
 * A Standard Schema-compatible validator: a minimal duck-type covering Zod v3/v4, valibot, and
 * arktype schemas. Only the `~standard.validate` method is required at runtime.
 */
export type StandardSchemaValidator<TOutput = unknown> = {
  readonly '~standard': {
    validate(
      value: unknown,
    ): StandardSchemaResult<TOutput> | Promise<StandardSchemaResult<TOutput>>
  }
}

/**
 * The two possible outcomes of a Standard Schema `validate` call. A successful result carries
 * `value`; a failed result carries `issues`.
 */
export type StandardSchemaResult<TOutput> =
  | { readonly value: TOutput; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> }

/**
 * One validation issue from a Standard Schema `validate` call.
 */
export type StandardSchemaIssue = {
  readonly message?: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
}

/**
 * Thrown by `validateStandardSchema` when validation fails. Carries the raw `issues` array from
 * the schema's `validate` result so callers receive a uniform error shape regardless of which
 * schema library is in use.
 */
export class ParseError extends Error {
  readonly issues: ReadonlyArray<StandardSchemaIssue>

  constructor({
    issues,
    message,
  }: {
    issues: ReadonlyArray<StandardSchemaIssue>
    message?: string
  }) {
    super(message ?? 'Validation failed')
    this.name = 'ParseError'
    this.issues = issues
  }
}

/**
 * Validates `value` against a Standard Schema-compatible `schema`. Returns the parsed output on
 * success; throws `ParseError` with the schema's `issues` on failure. Handles both sync and async
 * `validate` implementations transparently.
 *
 * @example
 * const pet = await validateStandardSchema(PetSchema, rawData)
 */
export async function validateStandardSchema<TOutput>(
  schema: StandardSchemaValidator<TOutput>,
  value: unknown,
): Promise<TOutput> {
  const result = await schema['~standard'].validate(value)
  if (result.issues) {
    throw new ParseError({ issues: result.issues })
  }
  return (result as { value: TOutput }).value
}

/**
 * Wraps an object schema so its keys match case-insensitively.
 * Keys the schema does not declare pass through untouched.
 * The declared keys are validated with `schema` under their declared names.
 * Every key, and every issue path, keeps the casing the caller used.
 *
 * @param schema Standard Schema-compatible object schema.
 * @param entries The record of keys the passed object schema validates.
 * @example
 * ```ts
 * validator: { headers: toHeadersStandardSchema(putEventHeadersSchema, putEventHeadersSchema.shape) }
 * ```
 */
export function toHeadersStandardSchema(
  schema: StandardSchemaValidator,
  entries: Record<string, unknown>,
): StandardSchemaValidator {
  const declared = new Map(
    Object.keys(entries).map((name) => [name.toLowerCase(), name]),
  )

  function validate(
    value: unknown,
  ): StandardSchemaResult<unknown> | Promise<StandardSchemaResult<unknown>> {
    if (typeof value !== 'object' || value === null) {
      return { issues: [{ message: 'Expected an object' }] }
    }

    const originalKeys = new Map<string, string>()
    const declaredValues: Record<string, unknown> = {}
    const undeclaredValues: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const name = declared.get(key.toLowerCase())
      if (name === undefined) {
        undeclaredValues[key] = entry
        continue
      }
      originalKeys.set(name, key)
      declaredValues[name] = entry
    }

    const toOriginal = (key: string) => originalKeys.get(key) ?? key
    const settle = (
      result: StandardSchemaResult<unknown>,
    ): StandardSchemaResult<unknown> => {
      if (result.issues) {
        return {
          issues: result.issues.map(
            (issue): StandardSchemaIssue => ({
              ...issue,
              path: issue.path?.map((segment, index) =>
                index === 0 && typeof segment === 'string'
                  ? toOriginal(segment)
                  : segment,
              ),
            }),
          ),
        }
      }
      const validated = Object.entries(
        (result.value ?? {}) as Record<string, unknown>,
      ).map(([key, entry]) => [toOriginal(key), entry])
      return {
        value: { ...undeclaredValues, ...Object.fromEntries(validated) },
      }
    }

    const result = schema['~standard'].validate(declaredValues)
    return result instanceof Promise ? result.then(settle) : settle(result)
  }

  return { '~standard': { validate } }
}

/**
 * Identifies the value and request that failed validation in `onValidationError`.
 */
export type ValidationErrorContext = {
  value: unknown
  direction: 'request' | 'response' | 'error'
  source: 'body' | 'path' | 'query' | 'headers'
  method?: string
  url?: string
  status?: number
}

/**
 * Return `{ value }` to substitute a failed value, including `undefined`. Returning nothing rethrows the `ParseError`.
 */
export type ValidationErrorHandler = (
  error: ParseError,
  context: ValidationErrorContext,
) => { value: unknown } | void | Promise<{ value: unknown } | void>

/**
 * Turns generated validation on or off. `false` skips every validator, an object skips only the directions set to `false`:
 * `request` is the body, `params` are path, query, and header params, `response` and `error` are the response bodies.
 * @default true
 */
export type ValidateOption =
  | boolean
  | { request?: boolean; params?: boolean; response?: boolean; error?: boolean }

export function isValidationEnabled(
  validate: ValidateOption | undefined,
  direction: 'request' | 'params' | 'response' | 'error',
): boolean {
  return typeof validate === 'object'
    ? validate[direction] !== false
    : validate !== false
}

/**
 * Runs a validator when there is one, handing a `ParseError` to `onValidationError` first, which may substitute the value.
 */
export async function runValidator<T>({
  validator,
  value,
  context,
  onValidationError,
}: {
  validator: StandardSchemaValidator<T> | undefined
  value: T
  context: Omit<ValidationErrorContext, 'value'>
  onValidationError: ValidationErrorHandler | undefined
}): Promise<T> {
  if (!validator) return value
  try {
    return await validateStandardSchema(validator, value)
  } catch (error) {
    if (!onValidationError || !(error instanceof ParseError)) throw error
    const handled = await onValidationError(error, { ...context, value })
    if (!handled) throw error
    return handled.value as T
  }
}
