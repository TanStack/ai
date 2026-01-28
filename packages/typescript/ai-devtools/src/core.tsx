import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

export interface AiDevtoolsInit {}

const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  lazy(() => import(/* @vite-ignore */ './components/Shell')),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
