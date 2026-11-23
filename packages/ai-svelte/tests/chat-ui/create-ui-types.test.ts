import { describe, expectTypeOf, it } from 'vitest'
import { defineActivityType } from '@tanstack/ai'
import { createChatUI } from '../../src/chat-ui/create-ui'
import { createChatHook } from '../../src/chat-ui/create-chat-hook'
import type {
  ActivityProps,
  ChatUIHost,
  InterruptProps,
  ToolProps,
  UIDescriptor,
} from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Component } from 'svelte'

// A valid component config for `chatOptions`. Each test changes one key.
const widgets = {
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
    generic: {
      choosePlan: {},
    },
  },
}

const progressSchema: StandardSchemaV1<{ step: number; total: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: () => ({ value: { step: 1, total: 3 } }),
  },
}
const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: progressSchema,
})
const activityOptions = { ...chatOptions, activities: [deployProgress] }

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
      ...widgets,
      toolsComponents: {
        getWeather: {},
        purchaseItem: {},
        // @ts-expect-error This tool is not in chatOptions.
        unknownTool: {},
      },
    })
    expectTypeOf(ui.useChatContext).returns.toEqualTypeOf<
      ChatUIHost<typeof chatOptions>
    >()

    createChatUI(chatOptions, {
      ...widgets,
      // @ts-expect-error Every configured tool needs a component.
      toolsComponents: {
        getWeather: {},
      },
    })

    createChatUI(chatOptions, {
      ...widgets,
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

  it('types activitiesComponents by activity type', () => {
    type Status = ActivityProps<typeof chatOptions, 'sandbox.status'>
    type Progress = ActivityProps<typeof activityOptions, 'deploy.progress'>
    expectTypeOf<Status['part']['content']['status']>().toEqualTypeOf<
      'starting' | 'ready' | 'failed'
    >()
    expectTypeOf<Progress['part']['content']>().toEqualTypeOf<{
      step: number
      total: number
    }>()
    // Stand-ins for `.svelte` files that type `$props()` with these props.
    const StatusCard: Component<Status> = () => ({})
    const ProgressCard: Component<Progress> = () => ({})

    // The built-in types are keys with no `activities` in the options.
    createChatUI(chatOptions, {
      ...widgets,
      activitiesComponents: {
        'sandbox.status': StatusCard,
        // @ts-expect-error chatOptions declares no 'deploy.progress' type.
        'deploy.progress': ProgressCard,
      },
    })

    // A declared type is a key, and each key takes a component for its part.
    const ui = createChatUI(activityOptions, {
      ...widgets,
      activitiesComponents: {
        'sandbox.status': StatusCard,
        'deploy.progress': ProgressCard,
      },
    })
    createChatUI(activityOptions, {
      ...widgets,
      activitiesComponents: {
        // @ts-expect-error A 'deploy.progress' component cannot take a 'sandbox.status' part.
        'sandbox.status': ProgressCard,
      },
    })

    // The UI components take a `UIDescriptor` with no options.
    const erased: UIDescriptor = ui
    void erased
  })

  it('types the messages of the bound chat with the activities', () => {
    const { createAppChat } = createChatHook({
      options: activityOptions,
      ...widgets,
    })
    type Part = Extract<
      ReturnType<typeof createAppChat>['messages'][number]['parts'][number],
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
