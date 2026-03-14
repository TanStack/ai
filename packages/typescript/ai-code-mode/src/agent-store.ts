export interface AgentSession {
  name: string
  systemPrompt: string
  memory: Record<string, unknown>
  createdAt: number
  lastUsedAt: number
}

export interface AgentStore {
  get(name: string): Promise<AgentSession | null>
  set(name: string, session: AgentSession): Promise<void>
  delete(name: string): Promise<void>
  list(): Promise<string[]>
}

export class InMemoryAgentStore implements AgentStore {
  private sessions = new Map<string, AgentSession>()

  async get(name: string): Promise<AgentSession | null> {
    return this.sessions.get(name) ?? null
  }

  async set(name: string, session: AgentSession): Promise<void> {
    this.sessions.set(name, session)
  }

  async delete(name: string): Promise<void> {
    this.sessions.delete(name)
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys())
  }
}

export function generateAgentName(): string {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `agent_${hex}`
}
