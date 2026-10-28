import { createSveltePlugin } from '@tanstack/devtools-utils/svelte'
import { AiDevtoolsPanel } from './AiDevtools'

const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] = createSveltePlugin({
  Component: AiDevtoolsPanel,
  name: 'TanStack AI',
  id: 'tanstack-ai',
  defaultOpen: true,
})

export { aiDevtoolsPlugin, aiDevtoolsNoOpPlugin }
