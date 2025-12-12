import { defineComponent } from 'vue'
import { AiDevtoolsPanel as DevToolsPanelComponent } from './AiDevtoolsPanel'
import * as plugin from './plugin'

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

export const aiDevtoolsPlugin =
  process.env.NODE_ENV !== 'development'
    ? plugin.aiDevtoolsNoOpPlugin
    : plugin.aiDevtoolsPlugin

export type { AiDevtoolsVueInit as AiDevtoolsVuePluginInit } from './AiDevtoolsPanel'
