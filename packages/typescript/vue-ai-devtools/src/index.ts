import { defineComponent } from 'vue'
import { AiDevtoolsPanel as DevToolsPanelComponent } from './AiDevtoolsPanel'

export type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

const NullComponent = /* #__PURE__ */ defineComponent({
  name: 'NullAiDevtoolsPanel',
  setup() {
    return () => null
  },
})

export const AiDevtoolsPanel =
  process.env.NODE_ENV !== 'development' ? NullComponent : DevToolsPanelComponent

export const AiDevtoolsPanelInProd = DevToolsPanelComponent

