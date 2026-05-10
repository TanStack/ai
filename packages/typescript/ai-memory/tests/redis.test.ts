// @ts-expect-error -- ioredis-mock has no bundled types and we don't need them
//   here; the contract test only exercises the RedisLike subset that
//   redisMemoryAdapter consumes (cast to `never` below).
import RedisMock from 'ioredis-mock'
import { runMemoryAdapterContract } from './contract'
import { redisMemoryAdapter } from '../src/adapters/redis'

runMemoryAdapterContract('redisMemoryAdapter', async () => {
  const client = new RedisMock()
  return redisMemoryAdapter({
    redis: client as never,
    prefix: `test:${crypto.randomUUID()}`,
  })
})
