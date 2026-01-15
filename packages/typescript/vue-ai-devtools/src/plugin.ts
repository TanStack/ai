import { createVuePlugin } from '@tanstack/devtools-utils/vue'
import { AiDevtoolsPanel } from './AiDevtoolsPanel'
import type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] =
  createVuePlugin<AiDevtoolsVueInit>('TanStack AI', AiDevtoolsPanel as any)
