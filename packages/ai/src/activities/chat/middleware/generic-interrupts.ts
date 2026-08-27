import { createCapability } from './capabilities'
import type { InterruptDefinition } from '../../../interrupt-definition'

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
