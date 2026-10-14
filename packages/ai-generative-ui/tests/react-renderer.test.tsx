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
  type GraphDocument,
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
    // "Pro (Recommended)" renders as a "Pro" heading + a "Recommended" badge.
    expect(container.textContent).toContain('Pro')
    expect(container.textContent).toContain('Recommended')
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

  // A live model commonly omits bind.value/bind.state and item ids, addressing
  // inputs by their node id. These must still be interactive.
  it('makes bind-less inputs interactive via implicit <id>.value / <id>.state', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const graph: GraphDocument = {
      specVersion: '0.1',
      graphId: 'g_bindless',
      revision: 1,
      title: 'Recipe',
      fallbackText: 'recipe',
      provenance: { driver: 'live' },
      root: {
        id: 'root',
        type: 'Stack',
        children: [
          {
            // Section title via "label" (not "title") still renders.
            id: 'ingredients',
            type: 'Section',
            props: { label: 'Ingredients' },
            children: [
              {
                id: 'checklist',
                type: 'Checklist',
                props: { items: [{ label: 'butter' }, { label: 'eggs' }] },
              },
            ],
          },
          {
            id: 'servings',
            type: 'Stepper',
            props: { label: 'Servings', value: 4, min: 1, max: 12, step: 1 },
          },
        ],
      },
    }

    await act(async () => {
      root.render(<GenerativeUIRenderer graph={graph} />)
    })

    expect(container.textContent).toContain('Ingredients')

    // Stepper seeded from props.value and increments despite having no bind.
    const plus = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+')
    expect(plus).toBeDefined()
    expect(container.textContent).toContain('4')
    await act(async () => {
      plus?.click()
    })
    expect(container.textContent).toContain('5')

    // Bind-less, id-less checklist items toggle independently and persist.
    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as Array<HTMLInputElement>
    expect(boxes.length).toBe(2)
    const [first, second] = boxes
    if (!first || !second) throw new Error('expected two checkboxes')
    expect(first.checked).toBe(false)
    await act(async () => {
      first.click()
    })
    expect(first.checked).toBe(true)
    expect(second.checked).toBe(false)

    root.unmount()
    container.remove()
  })
})
