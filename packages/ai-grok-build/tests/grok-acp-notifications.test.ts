import { describe, expect, it } from 'vitest'
import { createGrokAcpNotificationHandler } from '../src/process/grok-acp-notifications'
import type { AcpSessionUpdate } from '@tanstack/ai-acp'

describe('createGrokAcpNotificationHandler', () => {
  it('maps Grok tool_call_delta_chunk notifications to ACP tool_call updates', () => {
    const updates: Array<AcpSessionUpdate> = []
    const handle = createGrokAcpNotificationHandler((update) => updates.push(update))

    handle('_x.ai/session_notification', {
      update: {
        sessionUpdate: 'tool_call_delta_chunk',
        tool_call_id: 'call-1',
        name: 'list_dir',
      },
    })
    handle('_x.ai/session_notification', {
      update: {
        sessionUpdate: 'tool_call_delta_chunk',
        tool_call_id: 'call-1',
        arguments_delta: '{"target_directory":"."}',
      },
    })
    handle('_x.ai/session_notification', {
      update: {
        sessionUpdate: 'interaction_resolved',
        tool_call_id: 'call-1',
      },
    })

    expect(updates.map((u) => u.sessionUpdate)).toEqual([
      'tool_call',
      'tool_call_update',
      'tool_call_update',
    ])
    expect(
      updates.some(
        (u) =>
          u.sessionUpdate === 'tool_call_update' &&
          'status' in u &&
          u.status === 'completed',
      ),
    ).toBe(true)
  })

  it('ignores unrelated vendor notifications', () => {
    const updates: Array<AcpSessionUpdate> = []
    const handle = createGrokAcpNotificationHandler((update) => updates.push(update))
    handle('_x.ai/mcp/init_progress', { total: 1, connected: 0 })
    expect(updates).toEqual([])
  })
})