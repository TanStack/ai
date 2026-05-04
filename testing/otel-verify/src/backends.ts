/**
 * Backend presets for OTLP/HTTP export.
 *
 * Each preset describes how to talk to one OTel backend:
 *   - `endpoint()`: the OTLP/HTTP traces URL (a function so presets can derive
 *     it from env vars like SENTRY_DSN or DD_SITE).
 *   - `headers()`: required headers, reading env vars. Throws if a required
 *     env var is missing so the harness fails fast with a clear message.
 *   - `notes`: short prose surfaced in the harness banner. Lists per-backend
 *     setup gotchas (resource attrs, semconv flags, mapping rules).
 *
 * Adding a backend: add a new entry, then run `OTEL_BACKEND=<name> pnpm verify`.
 */

export interface BackendPreset {
  name: string
  endpoint: () => string
  headers: () => Record<string, string>
  notes: string
}

function envOrThrow(name: string, hint?: string): string {
  const value = process.env[name]
  if (!value) {
    const hintSuffix = hint ? ` — ${hint}` : ''
    throw new Error(`Missing required env var ${name}${hintSuffix}`)
  }
  return value
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

export const BACKENDS: Record<string, BackendPreset> = {
  // ---------------------------------------------------------------- self-hosted
  jaeger: {
    name: 'Jaeger (local)',
    endpoint: () => 'http://localhost:4318/v1/traces',
    headers: () => ({}),
    notes:
      'Generic OTel sink. Verifies span hierarchy + raw attribute round-trip. ' +
      'No GenAI-aware UI — useful for proving wire format only.',
  },

  'langfuse-self': {
    name: 'Langfuse (self-hosted)',
    endpoint: () => 'http://localhost:3000/api/public/otel/v1/traces',
    headers: () => ({
      Authorization: basicAuth(
        envOrThrow('LANGFUSE_PUBLIC_KEY'),
        envOrThrow('LANGFUSE_SECRET_KEY'),
      ),
    }),
    notes:
      'OSS LLM-observability backend. Basic auth using the public+secret key ' +
      'pair from /api/public/projects.',
  },

  phoenix: {
    name: 'Arize Phoenix (local)',
    endpoint: () => 'http://localhost:6006/v1/traces',
    headers: () => ({}),
    notes:
      'Uses OpenInference semconv, NOT gen_ai.*. Spans round-trip but token ' +
      'cost calc and most rich panels will be empty until an OpenInference ' +
      'shim lands. See https://github.com/Arize-ai/openinference/issues/2205',
  },

  helicone: {
    name: 'Helicone (self-hosted)',
    endpoint: () => 'http://localhost:8585/v1/traces',
    headers: () => ({
      Authorization: `Bearer ${envOrThrow('HELICONE_API_KEY')}`,
    }),
    notes:
      'Proxy-based; OTel ingestion is best-effort. Lower-priority backend.',
  },

  // ---------------------------------------------------------------------- SaaS
  posthog: {
    name: 'PostHog (Cloud)',
    endpoint: () => {
      const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com'
      return `${host.replace(/\/$/, '')}/i/v0/otel/v1/traces`
    },
    headers: () => ({
      Authorization: `Bearer ${envOrThrow('POSTHOG_API_KEY', 'use a project Personal API key')}`,
    }),
    notes:
      'PostHogSpanProcessor maps gen_ai.* → $ai_* events. Only forwards spans ' +
      'whose name/attrs start with gen_ai., llm., ai., or traceloop.',
  },

  'langfuse-cloud': {
    name: 'Langfuse (Cloud EU)',
    endpoint: () => {
      // Accept either env var: LANGFUSE_HOST (this harness's original name) or
      // LANGFUSE_BASE_URL (used by the Langfuse JS SDK). If neither is set,
      // default to EU. Mismatched region is the most common cause of 401
      // "Invalid credentials. Confirm that you've configured the correct host."
      const host =
        process.env.LANGFUSE_HOST ??
        process.env.LANGFUSE_BASE_URL ??
        'https://cloud.langfuse.com'
      return `${host.replace(/\/$/, '')}/api/public/otel/v1/traces`
    },
    headers: () => ({
      Authorization: basicAuth(
        envOrThrow('LANGFUSE_PUBLIC_KEY'),
        envOrThrow('LANGFUSE_SECRET_KEY'),
      ),
    }),
    notes:
      'For US region set LANGFUSE_HOST or LANGFUSE_BASE_URL to ' +
      'https://us.cloud.langfuse.com. A 401 "Invalid credentials. Confirm ' +
      'that you\'ve configured the correct host" usually means region ' +
      'mismatch between your keys and the host.',
  },

  sentry: {
    name: 'Sentry',
    endpoint: () => {
      const dsn = envOrThrow('SENTRY_DSN', 'project DSN from Sentry settings')
      const match = dsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/)
      if (!match) throw new Error('SENTRY_DSN format unrecognized')
      const [, host, projectId] = match
      return `https://${host}/api/${projectId}/otel/v1/traces`
    },
    headers: () => {
      const dsn = envOrThrow('SENTRY_DSN')
      const match = dsn.match(/^https?:\/\/([^@]+)@/)
      if (!match) throw new Error('SENTRY_DSN format unrecognized')
      return {
        'X-Sentry-Auth':
          `Sentry sentry_version=7, sentry_key=${match[1]}, ` +
          `sentry_client=tanstack-ai-otel-verify/0.1`,
      }
    },
    notes:
      'Sentry maps gen_ai.* per OTel semconv v1.36.0. AI Agents UI surfaces ' +
      'the trace tree natively.',
  },

  logfire: {
    name: 'Logfire (Pydantic)',
    endpoint: () => 'https://logfire-api.pydantic.dev/v1/traces',
    headers: () => ({
      Authorization: `Bearer ${envOrThrow('LOGFIRE_TOKEN', 'write token from project settings')}`,
    }),
    notes:
      'Strictest semconv validator. If anything fails to render here, fix ' +
      'before testing wider. UI: https://logfire.pydantic.dev',
  },

  traceloop: {
    name: 'Traceloop / OpenLLMetry Hub',
    endpoint: () => 'https://api.traceloop.com/v1/traces',
    headers: () => ({
      Authorization: `Bearer ${envOrThrow('TRACELOOP_API_KEY')}`,
    }),
    notes:
      'Authors of OpenLLMetry semconv. Canonical conformance reference for ' +
      'gen_ai.* attribute shape.',
  },

  datadog: {
    name: 'Datadog',
    endpoint: () =>
      `https://trace.agent.${process.env.DD_SITE ?? 'datadoghq.com'}/api/v0.2/traces`,
    headers: () => ({
      'DD-API-KEY': envOrThrow('DD_API_KEY'),
    }),
    notes:
      'Native OTel v1.37+ GenAI support. May require ' +
      'OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental.',
  },
}

export function resolveBackend(name: string): {
  name: string
  endpoint: string
  headers: Record<string, string>
  notes: string
} {
  const preset = BACKENDS[name]
  if (!preset) {
    const known = Object.keys(BACKENDS).join(', ')
    throw new Error(`Unknown OTEL_BACKEND=${name}. Known backends: ${known}`)
  }
  return {
    name: preset.name,
    endpoint: preset.endpoint(),
    headers: preset.headers(),
    notes: preset.notes,
  }
}
