import { describe, expect, it } from 'vitest'
import { a2uiActionToIntent, classifyA2uiAction } from '../src/a2ui/index'

describe('A2UI action classification (addendum §A5.6)', () => {
  it('classifies world-changing actions as Action and selections as Submit', () => {
    expect(classifyA2uiAction('book_flight')).toBe('action')
    expect(classifyA2uiAction('delete_row')).toBe('action')
    expect(classifyA2uiAction('select_seat')).toBe('submit')
    expect(classifyA2uiAction('filter_changed')).toBe('submit')
  })
})

describe('a2uiActionToIntent', () => {
  it('builds a host IntentPayload with the suggested class and context payload', () => {
    const intent = a2uiActionToIntent({
      graphId: 'a2ui:flight-1',
      nodeId: 'bookBtn',
      action: {
        event: { name: 'book_flight', context: { flightId: 'UA123' } },
      },
      state: { seat: '12A' },
    })
    expect(intent).toEqual({
      graphId: 'a2ui:flight-1',
      nodeId: 'bookBtn',
      intent: 'book_flight',
      intentClass: 'action',
      payload: { flightId: 'UA123' },
      state: { seat: '12A' },
    })
  })

  it('defaults state to an empty object and omits payload when there is no context', () => {
    const intent = a2uiActionToIntent({
      graphId: 'g',
      nodeId: 'n',
      action: { event: { name: 'select_seat' } },
    })
    expect(intent.intentClass).toBe('submit')
    expect(intent.payload).toBeUndefined()
    expect(intent.state).toEqual({})
  })
})
