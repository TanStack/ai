// @vitest-environment happy-dom
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  GenerativeUIRenderer,
  comparePlansBasicFixture,
  billSplitFixture,
  chordDiagramEmaj7Fixture,
} from '../src/index'

describe('GenerativeUIRenderer React Component', () => {
  it('renders compare plans fixture with columns and buttons', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const onIntent = vi.fn()

    await act(async () => {
      root.render(
        <GenerativeUIRenderer
          graph={comparePlansBasicFixture}
          onIntent={onIntent}
        />,
      )
    })

    expect(container.textContent).toContain('Compare Hosting Plans')
    expect(container.textContent).toContain('Starter')
    expect(container.textContent).toContain('Pro (Recommended)')
    expect(container.textContent).toContain('Enterprise')

    const proBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Select Pro'),
    )
    expect(proBtn).toBeDefined()

    await act(async () => {
      proBtn?.click()
    })

    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        graphId: 'g_compare_plans_01',
        intent: 'selectPlan',
        intentClass: 'action',
        payload: { plan: 'pro' },
      }),
    )

    root.unmount()
    container.remove()
  })

  it('evaluates compute bindings and updates display values', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <GenerativeUIRenderer
          graph={billSplitFixture}
          initialState={{ subtotal: 100, tipPercent: 20, splitCount: 4 }}
        />,
      )
    })

    expect(container.textContent).toContain('Dinner Bill Splitter')
    expect(container.textContent).toContain('Calculated Totals (Computed by Host Code)')

    // 100 subtotal, 20% tip = $20 tip, $120 total, $30 per person
    expect(container.textContent).toContain('Tip Amount')
    expect(container.textContent).toContain('Total with Tip')
    expect(container.textContent).toContain('Per Person')

    root.unmount()
    container.remove()
  })

  it('renders vector scene and handles interactive shape selection (§6.4.2)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const onIntent = vi.fn()

    await act(async () => {
      root.render(
        <GenerativeUIRenderer
          graph={chordDiagramEmaj7Fixture}
          onIntent={onIntent}
        />,
      )
    })

    expect(container.textContent).toContain('Guitar Voicing: Open Emaj7')

    const svg = container.querySelector('svg')
    expect(svg).toBeDefined()

    const interactiveNote = container.querySelector('[id="note-b-5"]') as SVGElement
    expect(interactiveNote).toBeDefined()
    expect(interactiveNote.getAttribute('role')).toBe('button')
    expect(interactiveNote.getAttribute('aria-label')).toContain('B — Perfect 5th')

    await act(async () => {
      interactiveNote.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'note-b-5',
        intent: 'noteSelected',
        intentClass: 'local',
        payload: expect.objectContaining({ shapeId: 'note-b-5' }),
      }),
    )

    root.unmount()
    container.remove()
  })
})
