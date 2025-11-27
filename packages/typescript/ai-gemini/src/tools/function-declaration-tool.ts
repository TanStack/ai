import type { FunctionDeclaration } from '@google/genai'

export type FunctionDeclarationTool = FunctionDeclaration

const validateFunctionDeclarationTool = (tool: FunctionDeclarationTool) => {
  const nameRegex = /^[a-zA-Z0-9_:.-]{1,64}$/
  const valid = nameRegex.test(tool.name!)
  if (!valid) {
    throw new Error(
      `Invalid function name: ${tool.name}. Must be 1-64 characters long and contain only a-z, A-Z, 0-9, underscores, colons, dots, and dashes.`,
    )
  }

  if (tool.parameters && tool.parametersJsonSchema) {
    throw new Error(
      `FunctionDeclarationTool cannot have both 'parameters' and 'parametersJsonSchema' defined. Please use only one.`,
    )
  }

  if (tool.response && tool.responseJsonSchema) {
    throw new Error(
      `FunctionDeclarationTool cannot have both 'response' and 'responseJsonSchema' defined. Please use only one.`,
    )
  }
}

export function functionDeclarationTools(
  tools: Array<FunctionDeclarationTool>,
) {
  tools.forEach(validateFunctionDeclarationTool)
  return {
    functionDeclarations: tools,
  }
}
