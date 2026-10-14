import type { ModelReasoning, ReasoningLevel } from '@tanstack/ai'

/** The reasoning data of a model that reasons. */
export type ReasoningShape = Exclude<ModelReasoning, false>

// ponytail: a copy of REASONING_LEVELS, because the scripts run without a build of @tanstack/ai.
const LEVELS: ReadonlyArray<ReasoningLevel> = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/** The shape as source code, with its levels from least to most thinking. */
export function formatReasoningShape(shape: ReasoningShape): string {
  const levels = LEVELS.filter((level) => shape.levels[level] !== undefined)
    .map((level) => `${level}: '${shape.levels[level]}'`)
    .join(', ')
  return `{ levels: { ${levels} }, budget: ${shape.budget} }`
}

/**
 * A constant name for a shape: `BUDGET_` when it takes a token budget, else
 * `EFFORT_`, then its levels. Three or more neighbouring levels sent as their
 * own names become `LOW_TO_HIGH`. A level sent as another value shows that
 * value, for example `NONE` for `off: 'none'`.
 */
export function reasoningShapeName(shape: ReasoningShape): string {
  const runs: Array<Array<string>> = []
  let open = false
  for (const level of LEVELS) {
    const value = shape.levels[level]
    if (value === undefined) {
      open = false
      continue
    }
    const token = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    const last = runs.at(-1)
    if (value === level && open && last) last.push(token)
    else runs.push([token])
    open = value === level
  }
  const levels = runs
    .map((run) =>
      run.length > 2 ? `${run[0]}_TO_${run[run.length - 1]}` : run.join('_'),
    )
    .join('_')
  return `${shape.budget ? 'BUDGET' : 'EFFORT'}_${levels}`
}

/**
 * One constant per distinct shape, so each model points at a shape instead of
 * repeating it. `names` gives the constant for a shape, keyed by
 * `formatReasoningShape`.
 */
export function reasoningShapeTable(shapes: Iterable<ReasoningShape>): {
  names: Map<string, string>
  code: string
} {
  const names = new Map<string, string>()
  for (const shape of shapes) {
    names.set(formatReasoningShape(shape), reasoningShapeName(shape))
  }
  const taken = new Set(names.values())
  if (taken.size !== names.size) {
    throw new Error('Two reasoning shapes got the same constant name')
  }
  const code = Array.from(names)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([source, name]) => `const ${name} = ${source} as const`)
    .join('\n')
  return { names, code }
}
