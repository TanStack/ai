declare module 'react-dom/server' {
  import type { ReactNode } from 'react'
  export function renderToStaticMarkup(node: ReactNode): string
}
