import { createCapability } from './capabilities'

export interface RunDisconnect {
  subscribe: (listener: () => void | Promise<void>) => void
}

export const RunDisconnectCapability =
  createCapability<RunDisconnect>()('run-disconnect')

export const [getRunDisconnect, provideRunDisconnect] = RunDisconnectCapability
