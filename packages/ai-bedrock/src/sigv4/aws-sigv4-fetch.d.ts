// aws-sigv4-fetch is an optional, user-installed dependency (NOT in our
// manifest — see package docs). This ambient declaration lets `tsc` resolve
// the dynamic `import('aws-sigv4-fetch')` without the package being present.
// No `any`, no cast.
declare module 'aws-sigv4-fetch' {
  export function createSignedFetcher(opts: {
    service: string
    region: string
  }): (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}
