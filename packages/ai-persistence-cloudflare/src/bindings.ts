export interface DurableObjectStubBinding {
  fetch: (
    input: Request | string | URL,
    init?: RequestInit,
  ) => Promise<Response>
}

/** The Durable Object namespace surface used by the lock client. */
export interface DurableObjectNamespaceBinding<TId = unknown> {
  idFromName: (name: string) => TId
  get: (id: TId) => DurableObjectStubBinding
}

export interface LockDurableObjectStorage {
  get: (key: string) => Promise<unknown>
  put: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<boolean>
  setAlarm: (timestamp: number) => Promise<void>
  deleteAlarm: () => Promise<void>
}

export interface LockDurableObjectState {
  storage: LockDurableObjectStorage
}
