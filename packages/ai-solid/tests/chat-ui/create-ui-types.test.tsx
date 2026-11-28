import { expectTypeOf, it } from 'vitest'
import { defineActivityType } from '@tanstack/ai'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createChatHook } from '../../src/chat-ui/create-chat-hook'
import { createChatUI } from '../../src/chat-ui/create-ui'
import { useChat } from '../../src/use-chat'
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
function SandboxCard(
  props: ActivityProps<typeof activityOptions, 'sandbox.status'>,
) {
  expectTypeOf(props.part.content.status).toEqualTypeOf<
    'starting' | 'ready' | 'failed'
  >()
  return null
}

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
    components: {
      layout: (props) => {
        expectTypeOf(UI.useChatContext()).toEqualTypeOf<
          ChatUIHost<typeof chatOptions>
        >()
        expectTypeOf(UI.useChatContext().sendMessage).toBeFunction()
        return <props.Messages />
      },
      message: (props) => <props.Parts />,
    },
    partsComponents: {
      fallback: () => null,
    },
    toolsComponents: {
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
    interruptsComponents: {
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

  const { useAppChat, useChatContext } = createChatHook({
    options: chatOptions,
    components: {
      layout: (props) => {
        expectTypeOf(useChatContext()).toEqualTypeOf<
          ChatUIHost<typeof chatOptions>
        >()
        return <props.Messages />
      },
      message: (props) => <props.Parts />,
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
    const chat = useAppChat({ threadId: 'thread-1' })
    expectTypeOf(chat).toMatchTypeOf<ChatUIHost<typeof chatOptions>>()
    expectTypeOf(chat.AppChat).not.toBeAny()
  }
  void checkBoundHook
})

it('types activitiesComponents by activity type', () => {
  const UI = createChatUI(activityOptions, {
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

  // A chat made from the same options fits the kit.
  const checkHost = () => {
    const chat = useChat({ ...activityOptions, threadId: 'thread-1' })
    return <UI.Chat chat={chat} />
  }
  void checkHost
})
