import { createMCPClient } from '../src/client'
import { travelServer } from './fixtures/travel-server'

export function travelClient() {
  return createMCPClient({ server: travelServer })
}
