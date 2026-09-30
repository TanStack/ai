/**
 * A minimal collapsible JSON tree. Objects and arrays render as native
 * <details> nodes, initially collapsed; primitives render inline and coloured.
 * `tryParse` returns null for non-JSON strings so callers can fall back to raw
 * text (a plain sentence isn't valid JSON and shouldn't be a tree).
 *
 * ponytail: native <details> recursion, no dependency. Reach for a json-view
 * lib only if we need search / copy-path / big-array virtualization.
 */

/** Parse a string as JSON, but only surface object/array roots as trees. */
export function tryParse(s: string | undefined): unknown {
  if (!s) return undefined
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : undefined
  } catch {
    return undefined
  }
}

export function JsonTree({ value }: { value: unknown }) {
  return <Node label={null} value={value} />
}

function Node({ label, value }: { label: string | null; value: unknown }) {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value)
    const count = entries.length
    const kind = Array.isArray(value)
      ? `[ ] ${count} item${count === 1 ? '' : 's'}`
      : `{ } ${count} key${count === 1 ? '' : 's'}`
    return (
      <details className="ml-2">
        <summary className="cursor-pointer text-white/60 marker:text-white/30">
          {label !== null && <Key label={label} />}
          <span className="text-white/40">{kind}</span>
        </summary>
        <div className="border-l border-white/10 pl-2">
          {entries.map(([k, v]) => (
            <Node key={k} label={k} value={v} />
          ))}
        </div>
      </details>
    )
  }
  return (
    <div className="ml-2">
      {label !== null && <Key label={label} />}
      <Leaf value={value} />
    </div>
  )
}

function Key({ label }: { label: string }) {
  return <span className="mr-1 text-sky-300">{label}:</span>
}

function Leaf({ value }: { value: unknown }) {
  if (typeof value === 'string')
    return <span className="text-emerald-200/80 break-all">"{value}"</span>
  if (typeof value === 'number')
    return <span className="text-amber-200/80">{value}</span>
  if (typeof value === 'boolean')
    return <span className="text-violet-300">{String(value)}</span>
  return <span className="text-white/40">null</span>
}
