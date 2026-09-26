export { createMCPServer } from './create-server'
export type { MCPServer } from './create-server'
export { promptDefinition, resourceDefinition } from './definitions'
export { introspectionVerifier, jwtVerifier } from './auth'
export type { IntrospectionVerifierOptions, JwtVerifierOptions } from './auth'
export { ToolInputRequiredError } from './context'
export type { MCPToolContext, SampleRequest, ToolInputRequest } from './context'
export { inMemoryTaskStore } from './stores'
export type { TaskStore } from './stores'
// The MCP SDK auth surface, so an app can use it without a direct dependency.
export {
  OAuthError,
  OAuthErrorCode,
  buildOAuthProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
} from '@modelcontextprotocol/server'
export type {
  AuthInfo,
  AuthMetadataOptions,
  BearerAuthOptions,
  OAuthTokenVerifier,
} from '@modelcontextprotocol/server'
