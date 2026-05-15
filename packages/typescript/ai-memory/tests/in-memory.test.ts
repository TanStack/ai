import { inMemoryMemoryAdapter } from '../src/adapters/in-memory'
import { runMemoryAdapterContract } from './contract'

runMemoryAdapterContract('inMemoryMemoryAdapter', () => inMemoryMemoryAdapter())
