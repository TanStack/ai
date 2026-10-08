import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Tools of the harness protocol route. The specs import the same
 * definitions, so a `ChatClient` knows `deploy` is an approval.
 */
export const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy to an environment. Needs approval.',
  needsApproval: true,
  inputSchema: z.object({ env: z.string() }),
})

/** Returns the context of the turn, so a spec can see what a tool got. */
export const probe = toolDefinition({
  name: 'probe',
  description: 'Show the context of this turn.',
  inputSchema: z.object({}),
})

/** Asks the user for a name, so the turn keeps running until the answer. */
export const askName = toolDefinition({
  name: 'askName',
  description: 'Ask the user for their name.',
  inputSchema: z.object({}),
})

/** Returns the id of the principal that the turn runs as. */
export const whoami = toolDefinition({
  name: 'whoami',
  description: 'Show who runs this turn.',
  inputSchema: z.object({}),
})

/** Builds until the test sends `release`, so a spec can move it to the background. */
export const slowBuild = toolDefinition({
  name: 'slowBuild',
  description: 'Build the project. It takes a while.',
  inputSchema: z.object({}),
})
