import { expectTypeOf } from 'vitest'
import { createUI } from '../src/create-ui'
import { chatOptions } from '../../ai-client/tests/ui-fixtures'

const ui = createUI(chatOptions)

ui.defineComponents({
  layout: () => null,
  message: () => null,
  parts: { fallback: () => null },
  tools: {
    getWeather: () => null,
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
