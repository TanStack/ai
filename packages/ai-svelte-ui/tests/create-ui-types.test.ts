import { describe, expectTypeOf, it } from 'vitest'
import { createUI } from '../src/create-ui'
import { chatOptions } from '../../ai-client/tests/ui-fixtures'

describe('Svelte createUI types', () => {
  it('infers defineComponents from a bare options variable', () => {
    const ui = createUI(chatOptions)
    ui.defineComponents({
      layout: {},
      message: {},
      parts: { fallback: {} },
      tools: {
        getWeather: {},
        // @ts-expect-error This tool is not in chatOptions.
        unknownTool: {},
      },
    })
    expectTypeOf(ui.defineComponents).toBeFunction()
  })
})
