/**
 * Public entry for the `coco` package.
 *
 * The primary surface is the CLI (`coco`) and the Vite plugin (`coco/vite`);
 * this module re-exports a handful of agent constants/types in case users
 * want to script around them.
 */
export {
  AGENTS,
  AGENT_BIN,
  AGENT_SETUP,
  DEFAULT_AGENT,
  isAgentId,
  isAgentMode,
  type AgentId,
  type AgentMode,
  type AgentSetup,
  type SetupStep,
} from './agents.ts'
