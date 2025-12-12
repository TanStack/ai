/// <reference types="vite/client" />
import { AiDevtoolsCore } from '@tanstack/ai-devtools-core'
import { createVuePanel, type DevtoolsPanelProps } from './createVuePanel'
import { defineComponent, h } from 'vue'
import type { PropType } from 'vue'

export interface AiDevtoolsVueInit {
  /**
   * Theme for the devtools UI.
   * Defaults to 'dark'.
   */
  theme?: DevtoolsPanelProps['theme']
}

const [InternalPanel] = createVuePanel(
  AiDevtoolsCore as unknown as new (
    _props: AiDevtoolsVueInit,
  ) => InstanceType<typeof AiDevtoolsCore>,
)

// Wrapper to make `devtoolsProps` optional for consumers.
export const AiDevtoolsPanel = defineComponent({
  name: 'AiDevtoolsPanel',
  props: {
    theme: {
      type: String as PropType<DevtoolsPanelProps['theme']>,
    },
    devtoolsProps: {
      type: Object as PropType<AiDevtoolsVueInit>,
      default: () => ({}),
    },
  },
  setup(props) {
    return () =>
      h(InternalPanel, {
        theme: props.theme ?? props.devtoolsProps?.theme,
        devtoolsProps: props.devtoolsProps,
      })
  },
})
