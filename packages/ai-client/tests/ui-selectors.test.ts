import { describe, expect, it } from 'vitest'
import {
  partTypeToKey,
  resolveInterruptComponent,
  selectChatUI,
} from '../src/ui'
import {
  approvalInterrupt,
  genericInterrupt,
  messageWithToolResults,
  orphanResultMessage,
  purchaseApprovalInterrupt,
  purchaseApprovalMessage,
  unboundInterrupt,
} from './ui-fixtures'

describe('selectChatUI', () => {
  it('matches results and partitions interrupts', () => {
    const selected = selectChatUI({
      messages: [messageWithToolResults],
      interrupts: [approvalInterrupt, genericInterrupt],
      inlineToolNames: ['purchaseItem'],
    })

    const parts = selected.messages[0]?.parts
    expect(parts?.map((part) => part.key)).toEqual([
      'toolCall',
      'toolResult',
      'structuredOutput',
    ])

    const call = parts?.[0]
    expect(call?.key).toBe('toolCall')
    if (call?.key === 'toolCall') {
      expect(call.result?.toolCallId).toBe(call.part.id)
      expect(call.interrupt).toBe(approvalInterrupt)
    }

    expect(selected.interrupts).toEqual([genericInterrupt])
  })

  it('uses camel-case component keys', () => {
    expect(partTypeToKey('tool-call')).toBe('toolCall')
    expect(partTypeToKey('tool-result')).toBe('toolResult')
    expect(partTypeToKey('structured-output')).toBe('structuredOutput')
    expect(partTypeToKey('ui-resource')).toBe('uiResource')
  })

  it('keeps unmatched tool-result parts', () => {
    const selected = selectChatUI({
      messages: [orphanResultMessage],
      interrupts: [],
    })
    const resultPart = selected.messages[0]?.parts[1]
    expect(resultPart?.key).toBe('toolResult')
    if (resultPart?.key === 'toolResult') {
      expect(resultPart.matched).toBe(false)
      expect(resultPart.part.toolCallId).toBe('missing-call')
    }
  })

  it('keeps orphan approvals in the interrupt list', () => {
    const selected = selectChatUI({
      messages: [messageWithToolResults],
      interrupts: [purchaseApprovalInterrupt],
      inlineToolNames: ['purchaseItem'],
    })
    expect(selected.interrupts).toEqual([purchaseApprovalInterrupt])
  })

  it('attaches list-placement approvals to the call and keeps them in the list', () => {
    const selected = selectChatUI({
      messages: [purchaseApprovalMessage],
      interrupts: [purchaseApprovalInterrupt],
      inlineToolNames: [],
    })
    const call = selected.messages[0]?.parts[0]
    expect(call?.key).toBe('toolCall')
    if (call?.key === 'toolCall') {
      expect(call.interrupt).toBe(purchaseApprovalInterrupt)
    }
    expect(selected.interrupts).toEqual([purchaseApprovalInterrupt])
  })

  it('hides inline approvals from the interrupt list when a call matches', () => {
    const selected = selectChatUI({
      messages: [purchaseApprovalMessage],
      interrupts: [purchaseApprovalInterrupt, genericInterrupt],
      inlineToolNames: ['purchaseItem'],
    })
    expect(selected.interrupts).toEqual([genericInterrupt])
  })

  it('preserves empty arrays', () => {
    const selected = selectChatUI({ messages: [], interrupts: [] })
    expect(selected.messages).toEqual([])
    expect(selected.interrupts).toEqual([])
  })

  it('preserves message and part order across every part key', () => {
    const selected = selectChatUI({
      messages: [
        {
          id: 'ordered',
          role: 'assistant',
          parts: [
            { type: 'thinking', content: 'hmm' },
            { type: 'text', content: 'hi' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
            },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/a.wav' },
            },
            {
              type: 'video',
              source: { type: 'url', value: 'https://example.com/a.mp4' },
            },
            {
              type: 'document',
              source: { type: 'url', value: 'https://example.com/a.pdf' },
            },
            {
              type: 'tool-call',
              id: 'call-a',
              name: 'getWeather',
              arguments: '{}',
              state: 'awaiting-input',
            },
            {
              type: 'tool-result',
              toolCallId: 'other',
              content: 'orphan',
              state: 'complete',
            },
            {
              type: 'structured-output',
              status: 'streaming',
              raw: '{',
            },
            {
              type: 'ui-resource',
              resource: {
                uri: 'ui://widget',
                mimeType: 'text/html',
                text: '<p></p>',
              },
              toolCallId: 'call-a',
              toolName: 'getWeather',
            },
          ],
        },
      ],
    })

    expect(selected.messages[0]?.parts.map((part) => part.key)).toEqual([
      'thinking',
      'text',
      'image',
      'audio',
      'video',
      'document',
      'toolCall',
      'toolResult',
      'structuredOutput',
      'uiResource',
    ])
  })

  it('keeps unbound and registered generic interrupts in the list', () => {
    const selected = selectChatUI({
      messages: [],
      interrupts: [genericInterrupt, unboundInterrupt],
    })
    expect(selected.interrupts).toEqual([genericInterrupt, unboundInterrupt])
  })
})

describe('resolveInterruptComponent', () => {
  const Plan = { id: 'plan' }
  const Fallback = { id: 'fallback' }
  const Purchase = { id: 'purchase' }
  const map = {
    tools: { purchaseItem: Purchase },
    generic: {
      choosePlan: Plan,
      fallback: Fallback,
    },
  }

  it('resolves a registered generic interrupt from generic[id]', () => {
    expect(resolveInterruptComponent(genericInterrupt, map)).toBe(Plan)
  })

  it('resolves unbound through generic.fallback', () => {
    expect(resolveInterruptComponent(unboundInterrupt, map)).toBe(Fallback)
  })

  it('resolves a tool approval from tools[name]', () => {
    expect(resolveInterruptComponent(approvalInterrupt, map)).toBe(Purchase)
  })
})
