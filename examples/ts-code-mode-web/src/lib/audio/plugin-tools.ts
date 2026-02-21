import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@tanstack/ai'

/**
 * Plugin Tools
 * 
 * Tools for creating and managing AudioWorklet plugins.
 * The plugins run on the client using the Web Audio API.
 */

/**
 * Create an AudioWorklet plugin from code
 */
export const pluginCreateTool = toolDefinition({
  name: 'plugin_create',
  description: `Create a reusable audio plugin from JavaScript code.
The code should be the body of an AudioWorkletProcessor class with:
- An optional constructor() for initialization
- A process(inputs, outputs, parameters) method that processes audio

Example processorCode for a gain plugin:
\`\`\`
constructor() {
  super();
  this.gain = 1.0;
}

process(inputs, outputs, parameters) {
  const input = inputs[0][0];
  const output = outputs[0][0];
  const gain = parameters.gain[0];
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] * gain;
  }
  return true;
}
\`\`\``,
  inputSchema: z.object({
    name: z.string().describe('Unique name for the plugin'),
    processorCode: z.string().describe('JavaScript code for the AudioWorkletProcessor'),
    params: z.array(z.object({
      name: z.string(),
      defaultValue: z.number(),
      min: z.number().optional(),
      max: z.number().optional(),
    })).optional().describe('Plugin parameters'),
    description: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    name: z.string(),
    message: z.string(),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('plugin:create', {
    name: input.name,
    processorCode: input.processorCode,
    params: input.params || [],
    description: input.description,
  })
  
  return {
    success: true,
    name: input.name,
    message: `Plugin "${input.name}" has been created and is ready to use in a monitor chain.`,
  }
})

/**
 * List all saved plugins
 * Note: Plugin list is managed client-side
 */
export const pluginListTool = toolDefinition({
  name: 'plugin_list',
  description: 'Get information about available audio plugins. The actual plugin list is displayed in the sidebar.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    message: z.string(),
    instructions: z.string(),
  }),
}).server((_input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('plugin:highlight_list', {})
  
  return {
    message: 'Available plugins are shown in the sidebar when monitor is active.',
    instructions: 'To see available plugins, start a monitor with the plugins you want to use. Created plugins can be used in monitor chains.',
  }
})

/**
 * Delete a plugin
 */
export const pluginDeleteTool = toolDefinition({
  name: 'plugin_delete',
  description: 'Delete a saved audio plugin.',
  inputSchema: z.object({
    name: z.string().describe('Name of the plugin to delete'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('plugin:delete', {
    name: input.name,
  })
  
  return {
    success: true,
    message: `Plugin "${input.name}" has been deleted.`,
  }
})

/**
 * Get plugin code for inspection
 * Note: This is primarily informational as plugin code is stored client-side
 */
export const pluginGetCodeTool = toolDefinition({
  name: 'plugin_getCode',
  description: 'Get information about how to inspect plugin code. Plugin code can be viewed in the browser console.',
  inputSchema: z.object({
    name: z.string().describe('Name of the plugin'),
  }),
  outputSchema: z.object({
    message: z.string(),
    instructions: z.string(),
  }),
}).server((input) => {
  return {
    message: `To view the code for plugin "${input.name}", check the browser developer console.`,
    instructions: 'Open DevTools (F12), go to the Console tab, and look for plugin registration logs.',
  }
})

// Export all plugin tools
export const pluginTools = [
  pluginCreateTool,
  pluginListTool,
  pluginDeleteTool,
  pluginGetCodeTool,
]
