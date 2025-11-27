import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

const Component = lazy(() => import('./components/Shell'))

export interface AiDevtoolsInit {}

const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(Component)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
