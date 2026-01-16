import { createVuePlugin } from '@tanstack/devtools-utils/vue'
import { AiDevtoolsPanel } from './AiDevtoolsPanel'
import type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

export const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] =
  createVuePlugin<AiDevtoolsVueInit>('TanStack AI', AiDevtoolsPanel)
