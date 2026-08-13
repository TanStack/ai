import * as Devtools from './AiDevtools'
import * as plugin from './plugin'

export const AiDevtoolsPanel =
  process.env.NODE_ENV !== 'development'
    ? Devtools.AiDevtoolsPanelNoOp
    : Devtools.AiDevtoolsPanel

export const aiDevtoolsPlugin =
  process.env.NODE_ENV !== 'development'
    ? plugin.aiDevtoolsNoOpPlugin
    : plugin.aiDevtoolsPlugin

export type { AiDevtoolsPreactInit } from './AiDevtools'
