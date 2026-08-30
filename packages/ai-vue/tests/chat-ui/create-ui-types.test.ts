import { expectTypeOf, it } from 'vitest'
import type { ChatUIComponents, ToolProps } from '../../src/chat-ui/create-ui'
import { chatOptions } from '../../../ai-client/tests/ui-fixtures'

it('types tool props from chatOptions', () => {
  type WeatherToolProps = ToolProps<typeof chatOptions, 'getWeather'>
  expectTypeOf<WeatherToolProps['part']['input']>().toEqualTypeOf<
    { city: string } | undefined
  >()

  const components = {
    layout: {},
    message: {},
    parts: { fallback: {} },
    tools: {
      getWeather: {},
      purchaseItem: {},
    },
    interrupts: {
      generic: {
        choosePlan: {},
        fallback: {},
      },
    },
  } satisfies ChatUIComponents<typeof chatOptions>
  void components
})
