import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

export interface AiDevtoolsInit {}

const path = './components/Shell'
const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  lazy(() => import(/* @vite-ignore */ path)),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
