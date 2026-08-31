import { expectTypeOf, it } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type {
  ChatUIHost,
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

  const UI = createChatUI(chatOptions)

  UI.defineComponents({
    layout: ({ renderMessages }) => {
      expectTypeOf(UI.useChat()).toEqualTypeOf<ChatUIHost<typeof chatOptions>>()
      expectTypeOf(UI.useChat().sendMessage).toBeFunction()
      expectTypeOf(UI.useChat().queue).toBeArray()
      return renderMessages()
    },
    message: ({ renderParts }) => renderParts(),
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

  UI.defineComponents({
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

  UI.defineComponents({
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

  const Untyped = createChatUI({})
  Untyped.defineComponents({
    layout: () => null,
    message: () => null,
    parts: { fallback: () => null },
  })
})
