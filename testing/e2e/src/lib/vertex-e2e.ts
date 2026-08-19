import type { VertexClientConfig } from '@tanstack/ai-vertex'

const E2E_PROJECT = 'e2e-project'
const E2E_LOCATION = 'us-central1'

// `@google/genai` defaults Vertex to `v1beta1`. aimock's Vertex handler only
// matches `/v1/projects/{p}/locations/{l}/publishers/google/models/{m}:…`.
const E2E_API_VERSION = 'v1'

type VertexAuthClient = NonNullable<
  NonNullable<VertexClientConfig['googleAuthOptions']>['authClient']
>

/**
 * Dummy Google auth so Vertex mode does not try Application Default
 * Credentials in CI. aimock does not check the bearer token.
 *
 * Project + location keep the Vertex request path
 * `/v1/projects/{p}/locations/{l}/publishers/google/models/{m}:streamGenerateContent`,
 * which aimock already serves.
 */
class E2eVertexAuthClient {
  async getRequestHeaders() {
    return new Headers({ Authorization: 'Bearer e2e-dummy' })
  }
}

export function vertexE2eConfig(
  baseUrl: string,
  headers?: Record<string, string>,
): VertexClientConfig {
  return {
    project: E2E_PROJECT,
    location: E2E_LOCATION,
    apiVersion: E2E_API_VERSION,
    httpOptions: { baseUrl, headers, apiVersion: E2E_API_VERSION },
    googleAuthOptions: {
      // GoogleAuthOptions.authClient is the abstract AuthClient class from
      // google-auth-library. GoogleAuth only calls getRequestHeaders() on
      // the cached client. This package does not depend on that library.
      authClient: new E2eVertexAuthClient() as VertexAuthClient,
    },
  }
}
