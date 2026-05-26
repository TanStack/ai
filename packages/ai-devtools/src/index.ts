import * as Devtools from './core'

export const AiDevtoolsCore =
  process.env.NODE_ENV !== 'development'
    ? Devtools.AiDevtoolsCoreNoOp
    : Devtools.AiDevtoolsCore

export type { AiDevtoolsInit } from './core'
