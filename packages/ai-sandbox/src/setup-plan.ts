export type SetupGroup =
  | { kind: 'serial'; command: string }
  | { kind: 'parallel'; commands: Array<string> }

export interface SetupBuilder {
  serial: (command: string) => void
  parallel: (commands: Array<string>) => void
}

export type SetupInput = Array<string> | ((builder: SetupBuilder) => void)

export function buildSetupPlan(input: SetupInput | undefined): Array<SetupGroup> {
  if (input === undefined) return []
  if (Array.isArray(input)) {
    return input.map((command) => ({ kind: 'serial', command }))
  }
  const groups: Array<SetupGroup> = []
  input({
    serial: (command) => groups.push({ kind: 'serial', command }),
    parallel: (commands) => groups.push({ kind: 'parallel', commands }),
  })
  return groups
}
