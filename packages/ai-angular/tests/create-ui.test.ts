import { Component, input } from '@angular/core'
import type { Type } from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { signal } from '@angular/core'
import { createChatUI } from '../ui/src/create-ui'
import type { ChatUIHost } from '../ui/src/create-ui'
import {
  chatOptions,
  createChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../ai-client/tests/ui-fixtures'
import type { ToolCallPart } from '@tanstack/ai-client'

function host(
  init?: Parameters<typeof createChatResult>[0],
): ChatUIHost<typeof chatOptions> {
  const chat = createChatResult(init ?? {})
  return {
    ...chat,
    messages: signal(chat.messages),
    interrupts: signal(chat.interrupts),
    pendingInterrupts: signal(chat.pendingInterrupts),
    queue: signal(chat.queue),
    isLoading: signal(chat.isLoading),
    error: signal(chat.error),
    status: signal(chat.status),
  } as unknown as ChatUIHost<typeof chatOptions>
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
  part = input.required<ToolCallPart>()
  result = input<unknown>()
  interrupt = input<unknown>()
  city = () => {
    const value = this.part().input as { city?: string } | undefined
    return value?.city ?? ''
  }
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
  selector: 'test-choose-plan',
  template: '',
})
class ChoosePlan {}

describe('createChatUI', () => {
  it('renders a tool part from chat options', async () => {
    const { Chat } = createChatUI(chatOptions, {
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
    })

    TestBed.configureTestingModule({ imports: [Chat] })
    const fixture = TestBed.createComponent(Chat)
    fixture.componentRef.setInput(
      'chat',
      host({ messages: [messageWithToolResults] }),
    )
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.nativeElement.textContent).toContain('Paris')
  })

  it('warns once for a missing tool component', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { Chat } = createChatUI(chatOptions, {
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
    })

    TestBed.configureTestingModule({ imports: [Chat] })
    const fixture = TestBed.createComponent(Chat)
    fixture.componentRef.setInput(
      'chat',
      host({ messages: [unknownToolMessage] }),
    )
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
