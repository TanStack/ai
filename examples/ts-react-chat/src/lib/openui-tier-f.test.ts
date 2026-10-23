import { describe, expect, it } from 'vitest'
import { buildArtifactDoc } from './openui-tier-f'

describe('buildArtifactDoc', () => {
  it('wraps a bare html fragment in a full document', async () => {
    const out = await buildArtifactDoc('html-fragment', '<h1>Hi</h1>')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.html).toMatch(/^<!doctype html>/i)
    expect(out.html).toContain('<h1>Hi</h1>')
  })

  it('passes a full html document through untouched', async () => {
    const doc = '<!doctype html><html><body>whole</body></html>'
    const out = await buildArtifactDoc('html-fragment', doc)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.html).toBe(doc)
  })

  it('compiles react-tsx into an import-map shell with the module inlined', async () => {
    const out = await buildArtifactDoc(
      'react-tsx',
      `import { useState } from 'react'
       export default function App() {
         const [n, setN] = useState(0)
         return <button onClick={() => setN(n + 1)}>{n}</button>
       }`,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.html).toContain('type="importmap"')
    expect(out.html).toContain('esm.sh/react')
    // The compiled module is inlined as a base64 data: URL ESM import.
    expect(out.html).toContain(
      "import Artifact from 'data:text/javascript;base64,",
    )
  })

  it('returns a model-facing error for invalid tsx instead of throwing', async () => {
    const out = await buildArtifactDoc(
      'react-tsx',
      'export default function( {',
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.error.length).toBeGreaterThan(0)
  })
})
