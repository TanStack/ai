import { useEffect, useState } from 'react'
import {
  getHighlighter,
  inferLangFromFilename,
  normalizeLang,
} from '@/lib/shiki/highlighter'

interface CodeBlockProps {
  code: string
  /** Explicit language override; takes precedence over `filename`. */
  lang?: string
  /** Used to infer language when `lang` is omitted (e.g. `src/server.ts`). */
  filename?: string
  /** Optional cap; longer code renders a scrollable region. */
  maxHeight?: string
  /** Append a blinking caret while content is still streaming. */
  streaming?: boolean
  className?: string
}

/**
 * Async-highlighted code block. Renders raw pre/code first (so the streaming
 * patch text shows up immediately) then swaps to shiki's HTML output once the
 * highlighter is ready and the language is loaded. Subsequent updates to
 * `code` re-highlight without re-loading the highlighter.
 *
 * XSS note: the inner HTML below is the return value of shiki's `codeToHtml`,
 * which runs the input through a textmate grammar and emits HTML-escaped
 * tokens. The only attack surface would be a bug in shiki itself; the model-
 * generated `code` string is otherwise opaque (no React render of raw user
 * HTML happens).
 */
export function CodeBlock(props: CodeBlockProps) {
  const lang = normalizeLang(
    props.lang ?? inferLangFromFilename(props.filename),
  )
  const [html, setHtml] = useState<string | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    // Object wrapper so the cleanup closure can mutate without ESLint's
    // no-unnecessary-condition narrowing the bool to `false` at the check
    // sites (it doesn't see the deferred cleanup mutation).
    const ctl = { cancelled: false }
    void (async () => {
      try {
        const highlighter = await getHighlighter()
        if (!highlighter.getLoadedLanguages().includes(lang)) {
          await highlighter.loadLanguage(
            lang as Parameters<typeof highlighter.loadLanguage>[0],
          )
        }
        if (ctl.cancelled) return
        const out = highlighter.codeToHtml(props.code, {
          lang,
          theme: 'tanstack-ink',
        })
        setHtml(out)
      } catch {
        if (!ctl.cancelled) setErrored(true)
      }
    })()
    return () => {
      ctl.cancelled = true
    }
  }, [props.code, lang])

  const containerStyle: React.CSSProperties = {
    maxHeight: props.maxHeight,
  }

  if (!html || errored) {
    return (
      <pre
        className={
          'font-mono text-[12.5px] leading-relaxed text-bone whitespace-pre-wrap bg-ink-soft/60 border-l-2 border-citron px-3 py-2 overflow-auto ' +
          (props.className ?? '')
        }
        style={containerStyle}
      >
        {props.code}
        {props.streaming && <span className="anim-blink text-citron">▌</span>}
      </pre>
    )
  }

  return (
    <div
      className={
        'shiki-wrap text-[12.5px] leading-relaxed border-l-2 border-citron overflow-auto ' +
        (props.className ?? '')
      }
      style={containerStyle}
    >
      {/* HTML produced by shiki — see XSS note in the component docblock. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {props.streaming && (
        <div className="px-3 pb-2 -mt-2 bg-ink-soft/60">
          <span className="anim-blink text-citron">▌</span>
        </div>
      )}
    </div>
  )
}
