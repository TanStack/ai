import { createPreactPlugin } from '@tanstack/devtools-utils/preact'
import { AiDevtoolsPanel } from './AiDevtools'

const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] = createPreactPlugin({
  Component: AiDevtoolsPanel,
  name: 'TanStack AI',
  id: 'tanstack-ai',
  defaultOpen: true,
})

export { aiDevtoolsPlugin, aiDevtoolsNoOpPlugin }
