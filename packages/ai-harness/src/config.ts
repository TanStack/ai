/**
 * A session setting a plugin declares, for example the model or the
 * thinking level. Hosts render it from this description (a picker in the
 * CLI, `configOptions` in ACP). A change applies at the next turn.
 */
export type ConfigOption =
  | {
      type: 'select'
      options: ReadonlyArray<string>
      default: string
      description?: string
      /** ACP category, for example `'model'` or `'thought_level'`. */
      category?: string
    }
  | { type: 'boolean'; default: boolean; description?: string }
  | { type: 'text'; default: string; description?: string }
  | {
      type: 'number'
      default: number
      min?: number
      max?: number
      description?: string
    }

type Without<T, K extends keyof T> = Omit<T, K>
type Option<TType extends ConfigOption['type']> = Extract<
  ConfigOption,
  { type: TType }
>

/** Helpers to declare {@link ConfigOption}s. */
export const configOption = {
  select: (option: Without<Option<'select'>, 'type'>): Option<'select'> => {
    if (!option.options.includes(option.default)) {
      throw new Error(
        `configOption.select: the default "${option.default}" is not an option.`,
      )
    }
    return { type: 'select', ...option }
  },
  boolean: (option: Without<Option<'boolean'>, 'type'>): Option<'boolean'> => ({
    type: 'boolean',
    ...option,
  }),
  text: (option: Without<Option<'text'>, 'type'>): Option<'text'> => ({
    type: 'text',
    ...option,
  }),
  number: (option: Without<Option<'number'>, 'type'>): Option<'number'> => ({
    type: 'number',
    ...option,
  }),
}

/** Check a value for an option. Returns the value, or throws with a reason. */
export function checkConfigValue(
  key: string,
  option: ConfigOption,
  value: unknown,
): unknown {
  const fail = (expected: string): never => {
    throw new Error(
      `Config "${key}" expects ${expected}, got ${JSON.stringify(value)}.`,
    )
  }
  switch (option.type) {
    case 'select':
      if (typeof value !== 'string' || !option.options.includes(value)) {
        fail(`one of ${option.options.join(', ')}`)
      }
      return value
    case 'boolean':
      if (typeof value !== 'boolean') fail('true or false')
      return value
    case 'text':
      if (typeof value !== 'string') fail('text')
      return value
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return fail('a number')
      if (option.min !== undefined && value < option.min)
        fail(`a number >= ${option.min}`)
      if (option.max !== undefined && value > option.max)
        fail(`a number <= ${option.max}`)
      return value
    }
  }
}
