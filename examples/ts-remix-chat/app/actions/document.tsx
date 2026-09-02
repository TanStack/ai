import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import { entryHref, entryPreloads, partialJsonHref } from '../assets.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
}

const DEFAULT_TITLE = readAppDisplayName('ts-remix-chat')

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title = DEFAULT_TITLE } = handle.props

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Inter:wght@300;400;600&display=swap"
            rel="stylesheet"
          />
          <title>{title}</title>
          <style>{PAGE_STYLES}</style>
          {head}
          {entryPreloads.map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
          <script type="importmap">
            {`{"imports":{"partial-json":${JSON.stringify(partialJsonHref)}}}`}
          </script>
          <script type="module" src={entryHref}></script>
        </head>
        <body mix={bodyStyle}>{children}</body>
      </html>
    )
  }
}

const PAGE_STYLES = `
:root {
  color-scheme: light dark;
  --bg: #eeebd4;
  --ink: #111111;
  --muted: #3e3529;
  --accent: #d3481b;
  --surface: #fffdf6;
  --border: color-mix(in srgb, #111111 14%, transparent);
  --shadow: 0 1px 2px color-mix(in srgb, #111111 8%, transparent),
    0 8px 24px color-mix(in srgb, #111111 6%, transparent);
  --font-display: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --ink: #ffffff;
    --muted: #aea691;
    --accent: #e06e49;
    --surface: #1c1c1c;
    --border: color-mix(in srgb, #ffffff 16%, transparent);
    --shadow: 0 1px 2px color-mix(in srgb, #000000 40%, transparent),
      0 8px 24px color-mix(in srgb, #000000 35%, transparent);
  }
}
@media (forced-colors: active) {
  :root {
    --bg: Canvas;
    --ink: CanvasText;
    --muted: CanvasText;
    --accent: LinkText;
    --surface: Canvas;
    --border: CanvasText;
    --shadow: none;
  }
}
html {
  height: 100%;
  font-size: 100%;
}
body {
  height: 100%;
  min-height: 100%;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
@media (prefers-color-scheme: dark) {
  img[alt="TanStack"] {
    filter: invert(1);
  }
}
`

const bodyStyle = css({
  margin: 0,
  minHeight: '100%',
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  lineHeight: 1.5,
})

function readAppDisplayName(value: string): string {
  return value.startsWith('%%') ? 'Remix App' : decodeURIComponent(value)
}
