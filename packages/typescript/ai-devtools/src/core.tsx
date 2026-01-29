import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

export interface AiDevtoolsInit {}

const shellUrl = '@tanstack/ai-devtools-core/shell'

const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  lazy(() => import(/* @vite-ignore */ shellUrl)),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
