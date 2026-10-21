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
    expect(container.textContent).toContain(
      'Calculated Totals (Computed by Host Code)',
    )

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

    const interactiveNote = container.querySelector(
      '[id="note-b-5"]',
    ) as SVGElement
    expect(interactiveNote).toBeDefined()
    expect(interactiveNote.getAttribute('role')).toBe('button')
    expect(interactiveNote.getAttribute('aria-label')).toContain(
      'B — Perfect 5th',
    )

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
    const plus = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '+',
    )
    expect(plus).toBeDefined()
    expect(container.textContent).toContain('4')
    await act(async () => {
      plus?.click()
    })
    expect(container.textContent).toContain('5')

    // Bind-less, id-less checklist items toggle independently and persist.
    const boxes = Array.from(
      container.querySelectorAll('input[type="checkbox"]'),
    ) as Array<HTMLInputElement>
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

  // A live model commonly mis-wires a computed value: it writes the binding
  // PATH as a literal props.value string, or references the compute output by a
  // drifted name. The host must still show the host-computed number.
  it('resolves computed Metric values despite path-in-props and output-name drift', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const graph: GraphDocument = {
      specVersion: '0.1',
      graphId: 'g_mortgage_live',
      revision: 1,
      title: 'Mortgage',
      fallbackText: 'mortgage calculator',
      provenance: { driver: 'live' },
      root: {
        id: 'calc',
        type: 'Stack',
        compute: {
          name: 'loanPayment',
          inputs: {
            loanAmount: 'loanAmount',
            annualInterestRate: 'annualInterestRate',
            termYears: 'termYears',
          },
          output: 'loan',
        },
        children: [
          {
            id: 'amt',
            type: 'NumberInput',
            props: { label: 'Loan', value: 400000 },
            bind: { value: 'loanAmount' },
          },
          {
            id: 'rate',
            type: 'NumberInput',
            props: { label: 'Rate', value: 6.5 },
            bind: { value: 'annualInterestRate' },
          },
          {
            id: 'term',
            type: 'NumberInput',
            props: { label: 'Term', value: 30 },
            bind: { value: 'termYears' },
          },
          // Mistake 1: the binding path sits in props.value as a literal string.
          {
            id: 'mo',
            type: 'Metric',
            props: { label: 'Monthly Payment', value: 'loan.monthlyPayment' },
          },
          // Mistake 2: metric binds to a drifted output name; the leaf resolves.
          {
            id: 'tot',
            type: 'Metric',
            props: { label: 'Total Paid' },
            bind: { value: 'wrongName.totalPaid' },
          },
        ],
      },
    }

    await act(async () => {
      root.render(<GenerativeUIRenderer graph={graph} />)
    })

    // loanPayment(400000, 6.5%, 30y) => monthlyPayment 2528.27, totalPaid 910177.95
    expect(container.textContent).toContain('2528.27')
    expect(container.textContent).toContain('910177.95')
    // The raw binding path must never leak into the rendered output.
    expect(container.textContent).not.toContain('loan.monthlyPayment')

    root.unmount()
    container.remove()
  })

  it('tolerates TanStack/HTML Table column + row naming (bounded repair, §9.3)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // A live model commonly drifts to accessor/header + data instead of the
    // catalog's key/label + rows; the renderer must still show the data.
    const graph: GraphDocument = {
      specVersion: '0.1',
      graphId: 'drifted-table',
      revision: 1,
      title: 'Plans',
      fallbackText: 'A table.',
      provenance: { driver: 'live' },
      root: {
        id: 't',
        type: 'Table',
        props: {
          columns: [
            { accessor: 'plan', header: 'Plan' },
            { accessorKey: 'price', title: 'Price' },
          ],
          data: [
            { plan: 'Basic', price: '$5' },
            { plan: 'Pro', price: '$20' },
          ],
        },
      },
    }

    await act(async () => {
      root.render(<GenerativeUIRenderer graph={graph} />)
    })

    expect(container.textContent).toContain('Plan')
    expect(container.textContent).toContain('Price')
    expect(container.textContent).toContain('Basic')
    expect(container.textContent).toContain('$5')
    expect(container.textContent).toContain('Pro')
    expect(container.textContent).toContain('$20')

    root.unmount()
    container.remove()
  })
})
