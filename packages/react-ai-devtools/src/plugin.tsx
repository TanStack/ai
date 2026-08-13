import { createReactPlugin } from '@tanstack/devtools-utils/react'
import { AiDevtoolsPanel } from './AiDevtools'

const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] = createReactPlugin({
  Component: AiDevtoolsPanel,
  name: 'TanStack AI',
  id: 'tanstack-ai',
  defaultOpen: true,
})

export { aiDevtoolsPlugin, aiDevtoolsNoOpPlugin }
