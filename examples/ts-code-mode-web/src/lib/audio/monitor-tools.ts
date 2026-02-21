import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@tanstack/ai'

/**
 * Monitor Tools
 * 
 * Tools for real-time audio processing with plugin chains.
 * Connects microphone -> plugins -> speakers for live monitoring.
 */

// Schema for plugin configuration in a chain
const pluginConfigSchema = z.string().describe('Plugin name').or(
  z.object({
    name: z.string(),
    params: z.record(z.string(), z.number()).optional(),
  })
)

/**
 * Start live monitoring with a plugin chain
 */
export const monitorStartTool = toolDefinition({
  name: 'monitor_start',
  description: 'Start live audio monitoring from microphone through a plugin chain to speakers.',
  inputSchema: z.object({
    plugins: z.array(pluginConfigSchema).describe('Plugin chain to apply'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    activePlugins: z.array(z.string()),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  // Normalize plugin configs
  const plugins = input.plugins.map(p => 
    typeof p === 'string' ? { name: p, params: {} } : p
  )
  
  emitCustomEvent('monitor:start', {
    plugins,
  })
  
  const pluginNames = plugins.map(p => p.name)
  return {
    success: true,
    message: `Live monitoring started with plugins: ${pluginNames.join(', ')}. Audio is now being processed from your microphone to your speakers.`,
    activePlugins: pluginNames,
  }
})

/**
 * Update a parameter on a running plugin
 */
export const monitorUpdateParamTool = toolDefinition({
  name: 'monitor_updateParam',
  description: 'Update a parameter on a running plugin in real-time.',
  inputSchema: z.object({
    pluginName: z.string().describe('Name of the plugin'),
    paramName: z.string().describe('Name of the parameter'),
    value: z.number().describe('New value'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('monitor:updateParam', {
    pluginName: input.pluginName,
    paramName: input.paramName,
    value: input.value,
  })
  
  return {
    success: true,
    message: `Updated ${input.pluginName}.${input.paramName} to ${input.value}`,
  }
})

/**
 * Get current parameter values for a plugin
 * Note: Returns guidance since actual values are client-side
 */
export const monitorGetParamsTool = toolDefinition({
  name: 'monitor_getParams',
  description: 'Get information about plugin parameters. Monitor status is shown in the sidebar.',
  inputSchema: z.object({
    pluginName: z.string().describe('Name of the plugin'),
  }),
  outputSchema: z.object({
    message: z.string(),
    instructions: z.string(),
  }),
}).server((input) => {
  return {
    message: `Plugin "${input.pluginName}" parameters can be seen in the Monitor Status panel.`,
    instructions: 'Check the sidebar for the Monitor Status section which shows active plugins and their parameters.',
  }
})

/**
 * Replace the plugin chain while monitoring
 */
export const monitorSetChainTool = toolDefinition({
  name: 'monitor_setChain',
  description: 'Replace the plugin chain while live monitoring is active.',
  inputSchema: z.object({
    plugins: z.array(pluginConfigSchema).describe('New plugin chain'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    activePlugins: z.array(z.string()),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plugins = input.plugins.map(p => 
    typeof p === 'string' ? { name: p, params: {} } : p
  )
  
  emitCustomEvent('monitor:setChain', {
    plugins,
  })
  
  const pluginNames = plugins.map(p => p.name)
  return {
    success: true,
    message: `Plugin chain updated to: ${pluginNames.join(', ')}`,
    activePlugins: pluginNames,
  }
})

/**
 * Stop live monitoring
 */
export const monitorStopTool = toolDefinition({
  name: 'monitor_stop',
  description: 'Stop live audio monitoring.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
}).server((_input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('monitor:stop', {})
  
  return {
    success: true,
    message: 'Live monitoring stopped. Microphone disconnected from speakers.',
  }
})

/**
 * Check if monitoring is active
 * Note: Returns guidance since actual state is client-side
 */
export const monitorIsActiveTool = toolDefinition({
  name: 'monitor_isActive',
  description: 'Get information about monitor status. Check the sidebar for live status.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    message: z.string(),
    instructions: z.string(),
  }),
}).server(() => {
  return {
    message: 'Monitor status is shown in the sidebar.',
    instructions: 'Check the Monitor Status section in the left sidebar to see if monitoring is active and which plugins are in the chain.',
  }
})

// Export all monitor tools
export const monitorTools = [
  monitorStartTool,
  monitorUpdateParamTool,
  monitorGetParamsTool,
  monitorSetChainTool,
  monitorStopTool,
  monitorIsActiveTool,
]
