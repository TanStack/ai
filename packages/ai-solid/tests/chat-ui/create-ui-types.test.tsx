import { expectTypeOf, it } from 'vitest'
import { createChatHook } from '../../src/chat-ui/create-chat-hook'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type {
  ChatUIHost,
  InterruptProps,
  ToolProps,
} from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

it('requires every tool name and interrupt id', () => {
  type PurchaseInterrupt = InterruptProps<typeof chatOptions, 'purchaseItem'>
  expectTypeOf<
    PurchaseInterrupt['interrupt']['toolName']
  >().toEqualTypeOf<'purchaseItem'>()
  type ChoosePlan = InterruptProps<typeof chatOptions, 'choosePlan'>
  expectTypeOf<ChoosePlan['interrupt']['payload']>().toEqualTypeOf<
    { title: string } | undefined
  >()
  type PurchaseTool = ToolProps<typeof chatOptions, 'purchaseItem'>
  expectTypeOf<
    NonNullable<PurchaseTool['interrupt']>['originalArgs']
  >().toEqualTypeOf<{
    item: string
  }>()

  const UI = createChatUI(chatOptions, {
    layout: (props) => {
      expectTypeOf(UI.useChatContext()).toEqualTypeOf<
        ChatUIHost<typeof chatOptions>
      >()
      expectTypeOf(UI.useChatContext().sendMessage).toBeFunction()
      return <props.Messages />
    },
    message: (props) => <props.Parts />,
    parts: {
      fallback: () => null,
    },
    tools: {
      getWeather: (props) => {
        expectTypeOf(props.part.input).toEqualTypeOf<
          { city: string } | undefined
        >()
        expectTypeOf(props.part.output).toEqualTypeOf<
          { temperature: number } | undefined
        >()
        return null
      },
      purchaseItem: (props) => {
        expectTypeOf(props.interrupt?.toolName).toEqualTypeOf<
          'purchaseItem' | undefined
        >()
        return null
      },
      // @ts-expect-error This tool is not in chatOptions.
      unknownTool: () => null,
    },
    interrupts: {
      generic: {
        choosePlan: (props) => {
          props.interrupt.resolveInterrupt('approved')
          // @ts-expect-error The response schema accepts a string.
          props.interrupt.resolveInterrupt(42)
          return null
        },
        fallback: () => null,
      },
    },
  })

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

  const { useAppChat, useChatContext } = createChatHook({
    options: chatOptions,
    chatComponents: {
      layout: (props) => {
        expectTypeOf(useChatContext()).toEqualTypeOf<
          ChatUIHost<typeof chatOptions>
        >()
        return <props.Messages />
      },
      message: (props) => <props.Parts />,
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
    expectTypeOf(chat.AppChat).not.toBeAny()
  }
  void checkBoundHook
})
