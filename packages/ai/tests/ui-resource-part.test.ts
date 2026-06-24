import { describe, expect, it } from 'vitest'
import type { MessagePart, UIResourceEvent, UIResourcePart } from '../src/types'

describe('UIResourcePart', () => {
  it('is assignable to MessagePart and discriminates on type', () => {
    const part: UIResourcePart = {
      type: 'ui-resource',
      resource: { uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' },
      serverId: 'weather',
      toolCallId: 'call_1',
    }
    const asPart: MessagePart = part
    expect(asPart.type).toBe('ui-resource')
  })

  it('UIResourceEvent is a CUSTOM event with a literal name', () => {
    const ev: UIResourceEvent = {
      type: 'CUSTOM',
      name: 'ui-resource',
      value: { resource: { uri: 'ui://s/w', mimeType: 'text/html' }, toolCallId: 'call_1' },
    } as UIResourceEvent
    expect(ev.name).toBe('ui-resource')
  })
})
