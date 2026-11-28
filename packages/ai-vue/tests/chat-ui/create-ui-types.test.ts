import { defineComponent, h } from 'vue'
import { expectTypeOf, it } from 'vitest'
import { defineActivityType } from '@tanstack/ai'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createChatUI } from '../../src/chat-ui/create-ui'
import type {
  ChatUIHost,
  InterruptProps,
  ToolProps,
} from '../../src/chat-ui/create-ui'
import type { ActivityProps } from '../../src/ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

type DeployProgress = { step: number; total: number }
const deployProgressSchema: StandardSchemaV1<DeployProgress> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: () => ({ value: { step: 0, total: 0 } }),
  },
}
const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: deployProgressSchema,
})
const activityOptions = { ...chatOptions, activities: [deployProgress] }

// A component in its own scope, typed with `ActivityProps`.
const SandboxCard = defineComponent(
  (props: ActivityProps<typeof activityOptions, 'sandbox.status'>) => {
    expectTypeOf(props.part.content.status).toEqualTypeOf<
      'starting' | 'ready' | 'failed'
    >()
    return () => h('b', props.part.content.status)
  },
  { props: ['part'] },
)

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

  const ui = createChatUI(chatOptions, {
    components: {
      layout: () => null,
      message: () => null,
    },
    partsComponents: { fallback: () => null },
    toolsComponents: {
      getWeather: () => null,
      purchaseItem: () => null,
      // @ts-expect-error This tool is not in chatOptions.
      unknownTool: () => null,
    },
    interruptsComponents: {
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
  expectTypeOf(ui.useChatContext).returns.toEqualTypeOf<
    ChatUIHost<typeof chatOptions>
  >()

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

  const untyped = createChatUI(
    {},
    {
      components: {
        layout: () => null,
        message: () => null,
      },
      partsComponents: { fallback: () => null },
    },
  )
  expectTypeOf(untyped.useChatContext).toBeFunction()
})

it('types activitiesComponents by activity type', () => {
  const ui = createChatUI(activityOptions, {
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
      generic: { choosePlan: () => null },
    },
    activitiesComponents: {
      'sandbox.status': SandboxCard,
      'deploy.progress': (props) => {
        expectTypeOf(props.part.content).toEqualTypeOf<DeployProgress>()
        return null
      },
      // @ts-expect-error No activity type has this name.
      'build.log': () => null,
    },
  })

  // The chat context types the declared activity parts too.
  type ContextPart = Extract<
    ReturnType<
      typeof ui.useChatContext
    >['messages']['value'][number]['parts'][number],
    { activityType: 'deploy.progress' }
  >
  expectTypeOf<ContextPart['content']>().toEqualTypeOf<DeployProgress>()
})
