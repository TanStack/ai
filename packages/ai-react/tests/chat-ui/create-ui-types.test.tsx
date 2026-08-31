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
    components: {
      layout: ({ Messages }) => {
        expectTypeOf(useChatContext()).toEqualTypeOf<
          ChatUIHost<typeof chatOptions>
        >()
        return <Messages />
      },
      message: ({ Parts }) => <Parts />,
    },
    partsComponents: { fallback: () => null },
    toolsComponents: {
      getWeather: () => null,
      purchaseItem: () => null,
    },
    interruptsComponents: {
      generic: {
        choosePlan: () => null,
        fallback: () => null,
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
    components: {
      layout: () => null,
      message: () => null,
    },
    partsComponents: { fallback: () => null },
    // @ts-expect-error Every configured tool needs a component.
    toolsComponents: {
      getWeather: () => null,
    },
    interruptsComponents: {
      generic: {
        choosePlan: () => null,
      },
    },
  })

  const UI = createChatUI(chatOptions, {
    components: {
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
    },
    partsComponents: {
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
    toolsComponents: {
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
    interruptsComponents: {
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
    components: {
      layout: () => null,
      message: () => null,
    },
    partsComponents: { fallback: () => null },
    // @ts-expect-error Every configured tool needs a component.
    toolsComponents: {
      getWeather: () => null,
    },
    interruptsComponents: {
      generic: {
        choosePlan: () => null,
      },
    },
  })

  createChatUI(chatOptions, {
    components: {
      layout: () => null,
      message: () => null,
    },
    partsComponents: { fallback: () => null },
    toolsComponents: {
      getWeather: () => null,
      purchaseItem: () => null,
    },
    interruptsComponents: {
      // @ts-expect-error Every registered interrupt id needs a component.
      generic: {
        fallback: () => null,
      },
    },
  })

  const Untyped = createChatUI(
    {},
    {
      components: {
        layout: () => null,
        message: () => null,
      },
      partsComponents: { fallback: () => null },
    },
  )
  expectTypeOf(Untyped.Chat).toBeFunction()
})

it('exposes `Input` on layout props only when an input component is registered', () => {
  const rest = {
    partsComponents: { fallback: () => null },
    toolsComponents: { getWeather: () => null, purchaseItem: () => null },
    interruptsComponents: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  } as const
  const message = ({ Parts }: MessageProps<typeof chatOptions>) => <Parts />

  createChatUI(chatOptions, {
    ...rest,
    components: {
      message,
      input: () => <textarea />,
      layout: ({ Messages, Input }) => (
        <>
          <Messages />
          <Input />
        </>
      ),
    },
  })

  createChatUI(chatOptions, {
    ...rest,
    components: {
      message,
      // @ts-expect-error `Input` is absent when no input component is registered
      layout: ({ Input }) => <Input />,
    },
  })

  // Nesting `layout` and `input` under `components` makes the inference
  // order-independent: `input` declared after `layout`, as a `function`
  // expression, still registers. Flattening this back would regress it.
  createChatUI(chatOptions, {
    ...rest,
    components: {
      message,
      layout: ({ Messages, Input }) => {
        return (
          <>
            <Messages />
            <Input />
          </>
        )
      },
      input: function ChatComposer() {
        return <textarea />
      },
    },
  })
})

it('applies the same conditional `Input` rule to createChatHook', () => {
  const rest = {
    partsComponents: { fallback: () => null },
    toolsComponents: { getWeather: () => null, purchaseItem: () => null },
    interruptsComponents: {
      generic: { choosePlan: () => null, fallback: () => null },
    },
  } as const
  const message = ({ Parts }: MessageProps<typeof chatOptions>) => <Parts />

  createChatHook({
    options: chatOptions,
    ...rest,
    components: {
      message,
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
    ...rest,
    components: {
      message,
      // @ts-expect-error `Input` is absent when no input component is registered
      layout: ({ Input }) => <Input />,
    },
  })
})
