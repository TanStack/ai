import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

export interface AiDevtoolsInit {}

const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  typeof window === 'undefined'
    ? () => null
    : lazy(() => import('./components/Shell')),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
