import { createPreactPanel } from '@tanstack/devtools-utils/preact'
import { AiDevtoolsCore } from '@tanstack/ai-devtools-core'
import type { DevtoolsPanelProps } from '@tanstack/devtools-utils/preact'

const [AiDevtoolsPanel, AiDevtoolsPanelNoOp] = createPreactPanel(AiDevtoolsCore)

export interface AiDevtoolsPreactInit extends DevtoolsPanelProps {}

export { AiDevtoolsPanel, AiDevtoolsPanelNoOp }
