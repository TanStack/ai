import { runMemoryAdapterContract } from './contract'
import { inMemoryMemoryAdapter } from '../src/adapters/in-memory'

runMemoryAdapterContract('inMemoryMemoryAdapter', () => inMemoryMemoryAdapter())
