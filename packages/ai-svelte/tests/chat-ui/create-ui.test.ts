/** @vitest-environment node */
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui'
import { UIChat } from '../../src/ui'
import {
  chatOptions,
  createSvelteChatResult,
} from '../../../ai-client/tests/ui-fixtures'
import Automatic from './fixtures/automatic.svelte'
import Manual from './fixtures/manual.svelte'
import Queue from './fixtures/queue.svelte'
import Layout from './fixtures/layout.svelte'
import Message from './fixtures/message.svelte'
import Fallback from './fixtures/fallback.svelte'
import Weather from './fixtures/weather.svelte'
import Empty from './fixtures/empty.svelte'
import { cancelled } from './fixtures/queue-data'
import type { UIMessage } from '@tanstack/ai-client'

function activityMessage(
  activityType: string,
  content: Record<string, unknown>,
): UIMessage {
  return {
    id: activityType,
    role: 'activity',
    parts: [{ type: 'activity', activityType, content }],
  }
}

describe('Svelte createChatUI', () => {
  it('renders automatic and snippet traversal', () => {
    expect(render(Automatic).body).toContain('<strong>Paris</strong>')
    expect(render(Manual).body).toContain('<span>1</span>')
  })

  it('renders each queued item and binds cancelQueued', () => {
    expect(render(Queue).body).toContain('<em>later</em>')
    expect(cancelled).toEqual(['q1'])
  })

  it('renders an activity part with the entry for its type, else partsComponents.activity', () => {
    const ui = createChatUI(chatOptions, {
      components: { layout: Layout, message: Message },
      // `weather.svelte` renders a `<strong>` tag.
      partsComponents: { activity: Weather, fallback: Empty },
      toolsComponents: { getWeather: Empty, purchaseItem: Empty },
      interruptsComponents: { generic: { choosePlan: Empty, fallback: Empty } },
      // `fallback.svelte` renders `<span>{part.type}</span>`.
      activitiesComponents: { 'sandbox.status': Fallback },
    })
    const chat = createSvelteChatResult([
      activityMessage('sandbox.status', {
        status: 'starting',
        provider: 'e2b',
      }),
      activityMessage('deploy.progress', { step: 1, total: 3 }),
    ])

    const { body } = render(UIChat, { props: { ui, chat } })

    expect(body.match(/<span>activity<\/span>|<strong><\/strong>/g)).toEqual([
      '<span>activity</span>',
      '<strong></strong>',
    ])
  })
})
