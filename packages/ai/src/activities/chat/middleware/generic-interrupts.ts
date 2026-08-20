import { createCapability } from './capabilities'
import type { InterruptDefinition } from '../../../interrupt-definition'

/**
 * Internal per-run registry of first-party generic interrupt definitions.
 *
 * Persistence uses this bridge while restoring a durable interrupt. It never
 * receives a definition from the stored record; it can only look up one that
 * the current chat call registered.
 */
export interface GenericInterruptDefinitionRegistry {
  readonly definitions: ReadonlyMap<
    string,
    InterruptDefinition<any, any, any, any>
  >
}

export const GenericInterruptDefinitionRegistryCapability =
  createCapability<GenericInterruptDefinitionRegistry>()(
    'generic-interrupt-definition-registry',
  )

export const [
  getGenericInterruptDefinitionRegistry,
  provideGenericInterruptDefinitionRegistry,
] = GenericInterruptDefinitionRegistryCapability
