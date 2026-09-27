/**
 * A tiny 5-field cron implementation (minute hour day-of-month month day-of-week)
 * for the schedule table. Enough for the POC: `*`, `*​/n`, `a`, `a-b`, and comma
 * lists. Production scheduling would use a real cron library + durable timers.
 */

const RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
]

function parseField(spec: string, [min, max]: [number, number]): Set<number> {
  const values = new Set<number>()
  for (const part of spec.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw ? Number(stepRaw) : 1
    if (!Number.isInteger(step) || step < 1) throw new Error('bad step')
    let lo = min
    let hi = max
    if (range !== '*' && range !== '') {
      const [a, b] = range.split('-')
      lo = Number(a)
      hi = b === undefined ? Number(a) : Number(b)
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max)
        throw new Error('out of range')
    }
    for (let v = lo; v <= hi; v += step) values.add(v)
  }
  return values
}

function parse(cron: string): Array<Set<number>> {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error('cron needs 5 fields')
  return fields.map((field, i) => parseField(field, RANGES[i]))
}

/** True if `cron` is a valid 5-field expression. */
export function isValidCron(cron: string): boolean {
  try {
    parse(cron)
    return true
  } catch {
    return false
  }
}

function matches(sets: Array<Set<number>>, date: Date): boolean {
  return (
    sets[0].has(date.getMinutes()) &&
    sets[1].has(date.getHours()) &&
    sets[2].has(date.getDate()) &&
    sets[3].has(date.getMonth() + 1) &&
    sets[4].has(date.getDay())
  )
}

/**
 * The next epoch-ms at which `cron` fires strictly after `fromMs` (seconds
 * truncated to 0). Returns undefined if none within a year (invalid combos).
 */
export function nextFireAfter(cron: string, fromMs: number): number | undefined {
  let sets: Array<Set<number>>
  try {
    sets = parse(cron)
  } catch {
    return undefined
  }
  const cursor = new Date(fromMs)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)
  for (let i = 0; i < 366 * 24 * 60; i += 1) {
    if (matches(sets, cursor)) return cursor.getTime()
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return undefined
}
