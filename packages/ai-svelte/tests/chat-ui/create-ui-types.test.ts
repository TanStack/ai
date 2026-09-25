import { describe, expectTypeOf, it } from 'vitest'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type {
  ChatUIHost,
  InterruptProps,
  ToolProps,
} from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

describe('Svelte createChatUI types', () => {
  it('infers the component map from chatOptions', () => {
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

    const ui = createChatUI(chatOptions, {
      components: {
        layout: {},
        message: {},
      },
      partsComponents: { fallback: {} },
      toolsComponents: {
        getWeather: {},
        purchaseItem: {},
        // @ts-expect-error This tool is not in chatOptions.
        unknownTool: {},
      },
      interruptsComponents: {
        generic: {
          choosePlan: {},
        },
      },
    })
    expectTypeOf(ui.useChatContext).returns.toEqualTypeOf<
      ChatUIHost<typeof chatOptions>
    >()

    createChatUI(chatOptions, {
      components: {
        layout: {},
        message: {},
      },
      partsComponents: { fallback: {} },
      // @ts-expect-error Every configured tool needs a component.
      toolsComponents: {
        getWeather: {},
      },
      interruptsComponents: {
        generic: {
          choosePlan: {},
        },
      },
    })

    createChatUI(chatOptions, {
      components: {
        layout: {},
        message: {},
      },
      partsComponents: { fallback: {} },
      toolsComponents: {
        getWeather: {},
        purchaseItem: {},
      },
      interruptsComponents: {
        // @ts-expect-error Every registered interrupt id needs a component.
        generic: {
          fallback: {},
        },
      },
    })

    const untyped = createChatUI(
      {},
      {
        components: {
          layout: {},
          message: {},
        },
        partsComponents: { fallback: {} },
      },
    )
    expectTypeOf(untyped.useChatContext).toBeFunction()
  })
})
