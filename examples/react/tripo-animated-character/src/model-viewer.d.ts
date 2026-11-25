import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// JSX type for the <model-viewer> element. @google/model-viewer types the
// element for the DOM only.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src: string
        alt: string
        autoplay?: boolean
        'camera-controls'?: boolean
      }
    }
  }
}
