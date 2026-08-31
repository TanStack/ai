import type { ComponentProps } from 'react'
import { expectTypeOf, it } from 'vitest'
import { createChatHook } from '../../src/chat-ui/create-chat-hook'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type {
  ChatUIHost,
  MessageProps,
  InterruptProps,
  PartProps,
  ToolProps,
} from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

it('types tool and interrupt component props from chatOptions', () => {
  type TextPartProps = PartProps<typeof chatOptions, 'text'>
  expectTypeOf<TextPartProps['part']['type']>().toEqualTypeOf<'text'>()
  expectTypeOf<TextPartProps['part']['content']>().toEqualTypeOf<string>()

  type WeatherToolProps = ToolProps<typeof chatOptions, 'getWeather'>
  expectTypeOf<WeatherToolProps['part']['input']>().toEqualTypeOf<
    { city: string } | undefined
  >()

  type PurchaseToolProps = ToolProps<typeof chatOptions, 'purchaseItem'>
  expectTypeOf<PurchaseToolProps['interrupt']>().toMatchTypeOf<
    { kind: 'tool-approval'; toolName: 'purchaseItem' } | undefined
  >()
  expectTypeOf<
    NonNullable<PurchaseToolProps['interrupt']>['originalArgs']
  >().toEqualTypeOf<{ item: string }>()

  type PurchaseInterruptProps = InterruptProps<
    typeof chatOptions,
    'purchaseItem'
  >
  expectTypeOf<
    PurchaseInterruptProps['interrupt']['kind']
  >().toEqualTypeOf<'tool-approval'>()
  expectTypeOf<
    PurchaseInterruptProps['interrupt']['toolName']
  >().toEqualTypeOf<'purchaseItem'>()
  expectTypeOf<
    PurchaseInterruptProps['interrupt']['originalArgs']
  >().toEqualTypeOf<{
    item: string
  }>()

  type ChoosePlanProps = InterruptProps<typeof chatOptions, 'choosePlan'>
  expectTypeOf<ChoosePlanProps['interrupt']['payload']>().toEqualTypeOf<
    { title: string } | undefined
  >()

  const { useAppChat, useChatContext } = createChatHook({
    options: chatOptions,
    chatComponents: {
      layout: ({ Messages }) => {
        expectTypeOf(useChatContext()).toEqualTypeOf<
          ChatUIHost<typeof chatOptions>
        >()
        return <Messages />
      },
      message: ({ Parts }) => <Parts />,
      parts: { fallback: () => null },
      tools: {
        getWeather: () => null,
        purchaseItem: () => null,
      },
      interrupts: {
        generic: {
          choosePlan: () => null,
          fallback: () => null,
        },
      },
    },
  })
  expectTypeOf(useAppChat).not.toBeAny()
  expectTypeOf(useChatContext).toBeFunction()

  const checkBoundHook = () => {
    const chat = useAppChat()
    expectTypeOf(chat).toMatchTypeOf<ChatUIHost<typeof chatOptions>>()
    expectTypeOf(chat.sendMessage).toBeFunction()
    expectTypeOf(chat.AppChat).not.toBeAny()
    expectTypeOf<ComponentProps<typeof chat.AppChat>>().not.toHaveProperty(
      'chat',
    )

    const message = chat.messages[0]
    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          expectTypeOf(part.name).toEqualTypeOf<'getWeather' | 'purchaseItem'>()
        }
      }
    }
  }
  void checkBoundHook

  createChatHook({
    options: chatOptions,
    chatComponents: {
      layout: () => null,
      message: () => null,
      parts: { fallback: () => null },
      // @ts-expect-error Every configured tool needs a component.
      tools: {
        getWeather: () => null,
      },
      interrupts: {
        generic: {
          choosePlan: () => null,
        },
      },
    },
  })

  const UI = createChatUI(chatOptions, {
    layout: ({ Messages }) => {
      expectTypeOf(UI.useChatContext()).toEqualTypeOf<
        ChatUIHost<typeof chatOptions>
      >()
      expectTypeOf(UI.useChatContext().sendMessage).toBeFunction()
      expectTypeOf(UI.useChatContext().queue).toBeArray()
      return <Messages />
    },
    message: ({ Parts }) => <Parts />,
    input: () => null,
    parts: {
      text: ({ part }) => {
        expectTypeOf(part.type).toEqualTypeOf<'text'>()
        expectTypeOf(part.content).toEqualTypeOf<string>()
        return null
      },
      structuredOutput: ({ part }) => {
        expectTypeOf(part.type).toEqualTypeOf<'structured-output'>()
        expectTypeOf(part.data).toEqualTypeOf<{ answer: string } | undefined>()
        return null
      },
      fallback: ({ part }) => {
        expectTypeOf(part.type).toBeString()
        return null
      },
    },
    tools: {
      getWeather: ({ part, result }) => {
        expectTypeOf(part.input).toEqualTypeOf<{ city: string } | undefined>()
        expectTypeOf(part.output).toEqualTypeOf<
          { temperature: number } | undefined
        >()
        expectTypeOf(result?.toolCallId).toEqualTypeOf<string | undefined>()
        return null
      },
      purchaseItem: () => null,
      // @ts-expect-error This tool is not in chatOptions.
      unknownTool: () => null,
    },
    interrupts: {
      generic: {
        choosePlan: ({ interrupt }) => {
          interrupt.resolveInterrupt('approved')
          // @ts-expect-error The response schema accepts a string.
          interrupt.resolveInterrupt(42)
          return null
        },
        // @ts-expect-error This interrupt is not in chatOptions.
        unknownInterrupt: () => null,
        fallback: () => null,
      },
    },
  })

  // This config registers an `input`, so its exact type flows onto the kit.
  expectTypeOf(UI.Input).toEqualTypeOf<(() => null) | undefined>()

  createChatUI(chatOptions, {
    layout: () => null,
    message: () => null,
    parts: { fallback: () => null },
    // @ts-expect-error Every configured tool needs a component.
    tools: {
      getWeather: () => null,
    },
    interrupts: {
      generic: {
        choosePlan: () => null,
      },
    },
  })

  createChatUI(chatOptions, {
    layout: () => null,
    message: () => null,
    parts: { fallback: () => null },
    tools: {
      getWeather: () => null,
      purchaseItem: () => null,
    },
    interrupts: {
      // @ts-expect-error Every registered interrupt id needs a component.
      generic: {
        fallback: () => null,
      },
    },
  })

  const Untyped = createChatUI(
    {},
    {
      layout: () => null,
      message: () => null,
      parts: { fallback: () => null },
    },
  )
  expectTypeOf(Untyped.Chat).toBeFunction()
})

it('exposes `Input` on layout props only when an input component is registered', () => {
  const base = {
    message: ({ Parts }: MessageProps<typeof chatOptions>) => <Parts />,
    parts: { fallback: () => null },
    tools: { getWeather: () => null, purchaseItem: () => null },
    interrupts: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  } as const

  createChatUI(chatOptions, {
    ...base,
    input: () => <textarea />,
    layout: ({ Messages, Input }) => (
      <>
        <Messages />
        <Input />
      </>
    ),
  })

  createChatUI(chatOptions, {
    ...base,
    // @ts-expect-error `Input` is absent when no input component is registered
    layout: ({ Input }) => <Input />,
  })
})

it('applies the same conditional `Input` rule to createChatHook', () => {
  const base = {
    message: ({ Parts }: MessageProps<typeof chatOptions>) => <Parts />,
    parts: { fallback: () => null },
    tools: { getWeather: () => null, purchaseItem: () => null },
    interrupts: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  } as const

  createChatHook({
    options: chatOptions,
    chatComponents: {
      ...base,
      input: () => <textarea />,
      layout: ({ Messages, Input }) => (
        <>
          <Messages />
          <Input />
        </>
      ),
    },
  })

  createChatHook({
    options: chatOptions,
    chatComponents: {
      ...base,
      // @ts-expect-error `Input` is absent when no input component is registered
      layout: ({ Input }) => <Input />,
    },
  })
})
