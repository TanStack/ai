import { constructCoreClass } from '@tanstack/devtools-utils/solid/class'

export interface AiDevtoolsInit {}

const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  () => import('./components/Shell'),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
