import { useEffect, useRef, useState } from 'react'

interface Draft {
  title?: string
  paragraphs?: Array<string>
}

export function DraftPreview(props: { draft: unknown; phase?: string }) {
  const draft = (
    props.draft && typeof props.draft === 'object' ? props.draft : null
  ) as Draft | null

  // Pulse highlight when the draft content changes — gives a sense of life.
  const [bumpKey, setBumpKey] = useState(0)
  const lastSerialized = useRef('')
  useEffect(() => {
    const next = JSON.stringify(draft ?? {})
    if (next !== lastSerialized.current) {
      lastSerialized.current = next
      setBumpKey((k) => k + 1)
    }
  }, [draft])

  const hasContent =
    draft && (draft.title || (draft.paragraphs && draft.paragraphs.length > 0))

  return (
    <aside className="relative">
      <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-4">
        <span className="label-mono text-bone">Draft Preview</span>
        <span className="label-mono text-taupe tabular">
          {hasContent
            ? `${(draft.paragraphs?.length ?? 0).toString().padStart(2, '0')} ¶`
            : '—'}
        </span>
      </div>

      <div className="relative bg-cream text-ink shadow-[8px_8px_0_0_var(--color-ink-soft)] border border-ink overflow-hidden">
        {/* phase stamp */}
        {props.phase && (
          <div className="absolute top-3 right-3 px-2 py-0.5 bg-ink text-cream label-mono">
            {props.phase}
          </div>
        )}

        {/* paper grain */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30 mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")",
          }}
        />

        <div
          key={bumpKey}
          className="relative px-6 py-7 max-h-[34rem] overflow-auto anim-log-in"
        >
          {!hasContent ? (
            <Empty />
          ) : (
            <>
              <div className="label-mono text-taupe-deep mb-3">
                Draft № {String(bumpKey).padStart(2, '0')}
              </div>
              {draft.title && (
                <h2
                  className="text-[clamp(1.5rem,2.4vw,2rem)] leading-[0.98] tracking-tight mb-5"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
                  }}
                >
                  {draft.title}
                </h2>
              )}
              {draft.paragraphs?.map((p, i) => (
                <p
                  key={i}
                  className={`mb-3.5 text-[14px] leading-[1.55] text-ink ${
                    i === 0
                      ? 'first-letter:float-left first-letter:text-5xl first-letter:font-bold first-letter:leading-[0.85] first-letter:mr-2 first-letter:text-rust'
                      : ''
                  }`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontVariationSettings: "'opsz' 14, 'SOFT' 100, 'WONK' 0",
                  }}
                >
                  {p}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function Empty() {
  return (
    <div className="py-10 text-center">
      <div
        className="text-3xl text-taupe-deep italic mb-2"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'opsz' 96, 'SOFT' 80, 'WONK' 1",
        }}
      >
        no draft yet.
      </div>
      <div className="label-mono text-taupe">awaiting writer</div>
    </div>
  )
}
