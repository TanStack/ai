import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

export interface AiDevtoolsInit {}

const shellUrl = new URL('./Shell.js', import.meta.url).href

const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  lazy(() => import(/* @vite-ignore */ shellUrl)),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
