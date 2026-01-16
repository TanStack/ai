/// <reference types="vite/client" />
import { AiDevtoolsCore } from '@tanstack/ai-devtools-core/production'
import { defineComponent, h } from 'vue'
import { createVuePanel } from './createVuePanel'
import type { DevtoolsPanelProps } from './createVuePanel'
import type { PropType } from 'vue'
import type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

const [InternalPanel] = createVuePanel(
  AiDevtoolsCore as unknown as new (
    _props: AiDevtoolsVueInit,
  ) => InstanceType<typeof AiDevtoolsCore>,
)

// Wrapper to make `devtoolsProps` optional for consumers.
export const AiDevtoolsPanelInProd = defineComponent({
  name: 'AiDevtoolsPanelInProd',
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
        theme: props.theme ?? props.devtoolsProps.theme,
        devtoolsProps: props.devtoolsProps,
      })
  },
})
