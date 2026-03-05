import { constructCoreClass } from '@tanstack/devtools-utils/solid/class'

export interface AiDevtoolsInit {}

const importPath = "./components/Shell"
const [AiDevtoolsCore, AiDevtoolsCoreNoOp] = constructCoreClass(
  () => import(importPath),
)

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
