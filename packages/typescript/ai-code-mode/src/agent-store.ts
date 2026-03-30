export interface AgentSession {
  name: string
  systemPrompt: string
  memory: Record<string, unknown>
  createdAt: number
  lastUsedAt: number
}

export interface AgentStore {
  get: (name: string) => Promise<AgentSession | null>
  set: (name: string, session: AgentSession) => Promise<void>
  delete: (name: string) => Promise<void>
  list: () => Promise<Array<string>>
}

export class InMemoryAgentStore implements AgentStore {
  private sessions = new Map<string, AgentSession>()

  get(name: string): Promise<AgentSession | null> {
    return Promise.resolve(this.sessions.get(name) ?? null)
  }

  set(name: string, session: AgentSession): Promise<void> {
    this.sessions.set(name, session)
    return Promise.resolve()
  }

  delete(name: string): Promise<void> {
    this.sessions.delete(name)
    return Promise.resolve()
  }

  list(): Promise<Array<string>> {
    return Promise.resolve(Array.from(this.sessions.keys()))
  }
}

export function generateAgentName(): string {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `agent_${hex}`
}
