import { Component, input } from '@angular/core'
import type { Type } from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { signal } from '@angular/core'
import { z } from 'zod'
import { defineActivityType } from '@tanstack/ai'
import { createChatUI } from '../ui/src/create-ui'
import { createChatHook } from '../ui/src/create-chat-hook'
import type { ActivityProps, ChatUIHost, ToolProps } from '../ui/src/create-ui'
import {
  chatOptions,
  createChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../ai-client/tests/ui-fixtures'
import type { UIMessage } from '@tanstack/ai-client'

function host(
  init?: Parameters<typeof createChatResult>[0],
): ChatUIHost<typeof chatOptions> {
  const chat = createChatResult(init ?? {})
  // The shared fixture holds plain `UIMessage` values and only some host
  // members, so it cannot be typed as the full typed host.
  return {
    ...chat,
    messages: signal(chat.messages),
    interrupts: signal(chat.interrupts),
    queue: signal(chat.queue),
    isLoading: signal(chat.isLoading),
    error: signal(chat.error),
    status: signal(chat.status),
  } as unknown as ChatUIHost<typeof chatOptions>
}

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

async function renderChat(Chat: Type<unknown>, messages: Array<UIMessage>) {
  TestBed.configureTestingModule({ imports: [Chat] })
  const fixture = TestBed.createComponent(Chat)
  fixture.componentRef.setInput('chat', host({ messages }))
  fixture.detectChanges()
  await fixture.whenStable()
  return fixture
}

@Component({
  selector: 'test-layout',
  imports: [NgComponentOutlet],
  template: `
    <ng-container [ngComponentOutlet]="Messages()" />
    <ng-container [ngComponentOutlet]="Interrupts()" />
  `,
})
class TestLayout {
  Messages = input.required<Type<unknown>>()
  Interrupts = input.required<Type<unknown>>()
  Queue = input.required<Type<unknown>>()
  Input = input<Type<unknown>>()
}

@Component({
  selector: 'test-message',
  imports: [NgComponentOutlet],
  template: `
    <article>
      <ng-container
        [ngComponentOutlet]="Parts()"
        [ngComponentOutletInputs]="{ message: message() }"
      />
    </article>
  `,
})
class TestMessage {
  message = input.required<unknown>()
  Parts = input.required<Type<unknown>>()
}

@Component({
  selector: 'test-weather',
  template: `<strong>{{ city() }}</strong>`,
})
class WeatherTool {
  part = input.required<ToolProps<typeof chatOptions, 'getWeather'>['part']>()
  result = input<unknown>()
  interrupt = input<unknown>()
  city = () => this.part().input?.city ?? ''
}

@Component({
  selector: 'test-fallback',
  template: `<span>{{ type() }}</span>`,
})
class FallbackPart {
  part = input.required<{ type: string }>()
  type = () => this.part().type
}

@Component({
  selector: 'test-sandbox-status',
  template: `<em>{{ status() }}</em>`,
})
class SandboxStatusCard {
  part =
    input.required<
      ActivityProps<typeof chatOptions, 'sandbox.status'>['part']
    >()
  status = () => this.part().content.status
}

@Component({
  selector: 'test-choose-plan',
  template: '',
})
class ChoosePlan {}

// A valid component config for `chatOptions`. Each test changes one key.
const widgets = {
  components: {
    layout: TestLayout,
    message: TestMessage,
  },
  partsComponents: { fallback: FallbackPart },
  toolsComponents: {
    getWeather: WeatherTool,
    purchaseItem: FallbackPart,
  },
  interruptsComponents: {
    generic: { choosePlan: ChoosePlan, fallback: FallbackPart },
  },
}

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number(), total: z.number() }),
})
const activityOptions = { ...chatOptions, activities: [deployProgress] }

describe('createChatUI', () => {
  it('renders a tool part from chat options', async () => {
    const { Chat } = createChatUI(chatOptions, widgets)

    const fixture = await renderChat(Chat, [messageWithToolResults])

    expect(fixture.nativeElement.textContent).toContain('Paris')
  })

  it('warns once for a missing tool component', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { Chat } = createChatUI(chatOptions, widgets)

    const fixture = await renderChat(Chat, [unknownToolMessage])
    fixture.detectChanges()

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('renders an activity part with the entry for its type, else partsComponents.activity', async () => {
    const { Chat } = createChatUI(chatOptions, {
      ...widgets,
      // `ChoosePlan` renders nothing, so a part that falls to it shows no text.
      partsComponents: { activity: FallbackPart, fallback: ChoosePlan },
      activitiesComponents: { 'sandbox.status': SandboxStatusCard },
    })

    const fixture = await renderChat(Chat, [
      activityMessage('sandbox.status', {
        status: 'starting',
        provider: 'e2b',
      }),
      activityMessage('deploy.progress', { step: 1, total: 3 }),
    ])

    const rendered: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll(
        'test-sandbox-status, test-fallback',
      )
    expect(Array.from(rendered, (element) => element.textContent)).toEqual([
      'starting',
      'activity',
    ])
  })

  it('keys activitiesComponents by activity type', () => {
    // The built-in types are keys with no `activities` in the options.
    createChatUI(chatOptions, {
      ...widgets,
      activitiesComponents: {
        'sandbox.status': SandboxStatusCard,
        'sandbox.approval': FallbackPart,
        // @ts-expect-error chatOptions declares no 'deploy.progress' type.
        'deploy.progress': FallbackPart,
      },
    })

    // A declared type is a key, and its entry gets the typed content.
    createChatUI(activityOptions, {
      ...widgets,
      activitiesComponents: { 'deploy.progress': FallbackPart },
    })
    type Progress = ActivityProps<typeof activityOptions, 'deploy.progress'>
    expectTypeOf<Progress['part']['content']>().toEqualTypeOf<{
      step: number
      total: number
    }>()

    // The bound chat types its messages with the activities.
    const { injectAppChat } = createChatHook({
      options: activityOptions,
      ...widgets,
    })
    type Part = Extract<
      ReturnType<
        ReturnType<typeof injectAppChat>['messages']
      >[number]['parts'][number],
      { type: 'activity' }
    >
    const read = (part: Part) => {
      if (part.activityType === 'deploy.progress') {
        expectTypeOf(part.content.step).toEqualTypeOf<number>()
      }
    }
    void read
  })
})
