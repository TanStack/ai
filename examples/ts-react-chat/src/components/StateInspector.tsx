import { useMemo } from 'react'

export function StateInspector(props: { state: unknown }) {
  const lines = useMemo(() => syntaxHighlight(props.state ?? {}), [props.state])
  const isEmpty =
    props.state === null ||
    props.state === undefined ||
    (typeof props.state === 'object' &&
      Object.keys(props.state as object).length === 0)

  return (
    <aside className="relative">
      <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-4">
        <span className="label-mono text-bone">State Snapshot</span>
        <span className="label-mono text-taupe">RFC 6902</span>
      </div>

      <div className="relative bg-cream text-ink shadow-[8px_8px_0_0_var(--color-ink-soft)] border border-ink">
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-citron text-ink label-mono">
          live
        </div>

        <div
          className="absolute inset-0 pointer-events-none opacity-30 mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")",
          }}
        />

        <div className="relative px-5 py-4 max-h-[28rem] overflow-auto">
          {isEmpty ? (
            <div
              className="text-2xl text-taupe-deep italic py-6"
              style={{
                fontFamily: 'var(--font-display)',
                fontVariationSettings: "'opsz' 96, 'SOFT' 100, 'WONK' 1",
              }}
            >
              uninitialized.
            </div>
          ) : (
            <pre className="font-mono text-[12px] leading-relaxed">{lines}</pre>
          )}
        </div>
      </div>
    </aside>
  )
}

/** Tiny syntax highlighter for pretty-printed JSON. */
function syntaxHighlight(value: unknown): React.ReactNode {
  const text = JSON.stringify(value, null, 2)
  if (!text) return null

  const pattern =
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}[\],])/g

  const tokens: Array<React.ReactNode> = []
  let cursor = 0
  let key = 0

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) tokens.push(text.slice(cursor, start))

    const [whole, propKey, str, kw, num, punc] = match
    if (propKey) {
      tokens.push(
        <span key={key++} className="text-rust">
          {propKey}
        </span>,
      )
    } else if (str) {
      tokens.push(
        <span key={key++} className="text-ink">
          {str}
        </span>,
      )
    } else if (kw) {
      tokens.push(
        <span key={key++} className="text-citron-deep font-semibold">
          {kw}
        </span>,
      )
    } else if (num) {
      tokens.push(
        <span key={key++} className="text-citron-deep">
          {num}
        </span>,
      )
    } else if (punc) {
      tokens.push(
        <span key={key++} className="text-taupe-deep">
          {punc}
        </span>,
      )
    } else {
      tokens.push(whole)
    }
    cursor = start + whole.length
  }
  if (cursor < text.length) tokens.push(text.slice(cursor))
  return tokens
}
