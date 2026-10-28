import { createSveltePanel } from '@tanstack/devtools-utils/svelte'
import { AiDevtoolsCore } from '@tanstack/ai-devtools-core/production'
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/svelte'

export interface AiDevtoolsSvelteInit extends DevtoolsPanelProps {}

const [AiDevtoolsPanel, AiDevtoolsPanelNoOp] = createSveltePanel(AiDevtoolsCore)

export { AiDevtoolsPanel, AiDevtoolsPanelNoOp }
