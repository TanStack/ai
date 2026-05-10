import { useEffect } from 'react'

interface Article {
  title: string
  paragraphs: Array<string>
}

export function ArticleModal(props: {
  article: Article
  onClose: () => void
}) {
  // Close on Escape, lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [props])

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Published article"
      className="fixed inset-0 z-50 anim-log-in"
    >
      {/* backdrop */}
      <div
        onClick={props.onClose}
        className="absolute inset-0 bg-ink/85 backdrop-blur-sm"
      />

      {/* page wrapper — scrollable */}
      <div className="relative h-full overflow-auto px-4 sm:px-8 py-10 flex justify-center">
        <article className="relative max-w-3xl w-full bg-cream text-ink shadow-[16px_16px_0_0_var(--color-citron)] my-4">
          {/* paper grain */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25 mix-blend-multiply"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
            }}
          />

          {/* hazard tape header strip */}
          <div className="tape-citron h-2.5" />

          {/* close button */}
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="absolute top-5 right-5 z-10 w-9 h-9 flex items-center justify-center bg-ink text-cream hover:bg-rust transition-colors label-mono"
          >
            ✕
          </button>

          <div className="relative px-8 sm:px-14 py-12">
            {/* masthead */}
            <div className="flex items-baseline justify-between border-b border-ink pb-3 mb-10">
              <span className="label-mono text-rust">Published</span>
              <span className="label-mono text-taupe-deep tabular">{date}</span>
            </div>

            <h1
              className="text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[0.96] tracking-tight mb-10"
              style={{
                fontFamily: 'var(--font-display)',
                fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
              }}
            >
              {props.article.title}
            </h1>

            {/* article body — column layout for longer pieces */}
            <div className="columns-1 md:columns-2 gap-10">
              {props.article.paragraphs.map((p, i) => (
                <p
                  key={i}
                  className={`mb-5 text-ink leading-[1.65] text-[17px] break-inside-avoid ${
                    i === 0
                      ? 'first-letter:float-left first-letter:text-7xl first-letter:font-bold first-letter:leading-[0.85] first-letter:mr-3 first-letter:text-rust'
                      : ''
                  }`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontVariationSettings:
                      "'opsz' 17, 'SOFT' 100, 'WONK' 0",
                  }}
                >
                  {p}
                </p>
              ))}
            </div>

            {/* colophon */}
            <footer className="mt-14 pt-5 border-t border-ink/40 flex items-baseline justify-between label-mono text-taupe-deep">
              <span>TanStack AI · Article Pipeline</span>
              <span>—fin—</span>
            </footer>
          </div>

          <div className="tape-citron h-2.5" />
        </article>
      </div>

      {/* corner hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 label-mono text-bone/60">
        press esc or click outside to close
      </div>
    </div>
  )
}
