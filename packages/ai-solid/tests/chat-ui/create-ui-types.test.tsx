import { expectTypeOf, it } from 'vitest'
import type {
  ChatUIComponents,
  ChatUIHost,
  ToolProps,
} from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

it('types tool props from chatOptions', () => {
  type WeatherToolProps = ToolProps<typeof chatOptions, 'getWeather'>
  expectTypeOf<WeatherToolProps['part']['input']>().toEqualTypeOf<
    { city: string } | undefined
  >()

  const components = {
    layout: (props: { chat: ChatUIHost<typeof chatOptions> }) => {
      expectTypeOf(props.chat.sendMessage).toBeFunction()
      return null
    },
    message: () => null,
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
  } satisfies ChatUIComponents<typeof chatOptions>
  void components
})
