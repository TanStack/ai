import { expectTypeOf, it } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type { ChatUIHost, InterruptProps, ToolProps } from '../../src/chat-ui/create-ui'
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
  >().toEqualTypeOf<{ item: string }>()

  const ui = createChatUI(chatOptions)
  expectTypeOf(ui.useChat).returns.toEqualTypeOf<
    ChatUIHost<typeof chatOptions>
  >()

  ui.defineComponents({
    layout: () => null,
    message: () => null,
    parts: { fallback: () => null },
    tools: {
      getWeather: () => null,
      purchaseItem: () => null,
      // @ts-expect-error This tool is not in chatOptions.
      unknownTool: () => null,
    },
    interrupts: {
      generic: {
        choosePlan: (props: {
          interrupt: { resolveInterrupt: (value: string) => void }
        }) => {
          expectTypeOf(props.interrupt.resolveInterrupt).toBeFunction()
          return null
        },
        fallback: () => null,
      },
    },
  })

  ui.defineComponents({
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

  ui.defineComponents({
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

  const untyped = createChatUI({})
  untyped.defineComponents({
    layout: () => null,
    message: () => null,
    parts: { fallback: () => null },
  })
})
