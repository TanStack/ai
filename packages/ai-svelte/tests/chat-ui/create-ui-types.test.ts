import { describe, expectTypeOf, it } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type { ChatUIHost, InterruptProps, ToolProps } from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

describe('Svelte createChatUI types', () => {
  it('infers defineComponents from a bare options variable', () => {
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
      layout: {},
      message: {},
      parts: { fallback: {} },
      tools: {
        getWeather: {},
        purchaseItem: {},
        // @ts-expect-error This tool is not in chatOptions.
        unknownTool: {},
      },
      interrupts: {
        generic: {
          choosePlan: {},
        },
      },
    })

    ui.defineComponents({
      layout: {},
      message: {},
      parts: { fallback: {} },
      // @ts-expect-error Every configured tool needs a component.
      tools: {
        getWeather: {},
      },
      interrupts: {
        generic: {
          choosePlan: {},
        },
      },
    })

    ui.defineComponents({
      layout: {},
      message: {},
      parts: { fallback: {} },
      tools: {
        getWeather: {},
        purchaseItem: {},
      },
      interrupts: {
        // @ts-expect-error Every registered interrupt id needs a component.
        generic: {
          fallback: {},
        },
      },
    })

    const untyped = createChatUI({})
    untyped.defineComponents({
      layout: {},
      message: {},
      parts: { fallback: {} },
    })
    expectTypeOf(ui.defineComponents).toBeFunction()
  })
})
