import { expectTypeOf } from 'vitest'
import type { MCPToolSource } from '@tanstack/ai'
import type { MCPClient, MCPClients } from '../src'

declare const client: MCPClient
declare const pool: MCPClients
expectTypeOf(client).toMatchTypeOf<MCPToolSource>()
expectTypeOf(pool).toMatchTypeOf<MCPToolSource>()
