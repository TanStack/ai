import { expectTypeOf, it } from 'vitest'
import { createChatUI } from '../src/create-ui'
import type { ChatUIHost, InterruptProps, ToolProps } from '../src/create-ui'
import { chatOptions } from '../../ai-client/tests/ui-fixtures'

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

  const UI = createChatUI(chatOptions)

  UI.defineComponents({
    layout: (props) => {
      expectTypeOf(UI.useChat()).toEqualTypeOf<ChatUIHost<typeof chatOptions>>()
      expectTypeOf(UI.useChat().sendMessage).toBeFunction()
      return props.renderMessages()
    },
    message: (props) => props.renderParts(),
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
