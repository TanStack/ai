import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BookOpen, Play, Square } from 'lucide-react'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  isReportAgent,
  isReportHarness,
  isReportProvider,
  REPORT_AGENTS,
  REPORT_HARNESSES,
  REPORT_PROVIDERS,
  REPORT_REPO,
} from '../repo-report-options'
import { looksLikeReport, RepoReportSchema } from '../repo-report-schema'
import type { RepoReportCard } from '../repo-report-schema'
import type {
  ReportAgent,
  ReportHarness,
  ReportProvider,
} from '../repo-report-options'
import type { UIMessage } from '@tanstack/ai-react'

export const Route = createFileRoute('/repo-report')({
  component: RepoReportPage,
})

function reportFromMessages(
  messages: Array<UIMessage>,
): RepoReportCard | undefined {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === 'structured-output') {
        if (part.data !== undefined && looksLikeReport(part.data)) {
          return part.data
        }
        if (part.partial !== undefined && looksLikeReport(part.partial)) {
          return part.partial
        }
      }
    }
  }
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== 'text' || typeof part.content !== 'string') continue
      const trimmed = part.content.trim()
      if (!trimmed.startsWith('{')) continue
      const parsed: unknown = parsePartialJSON(trimmed)
      if (looksLikeReport(parsed)) return parsed
    }
  }
  return undefined
}

function isCompleteReportJson(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) return false
  try {
    return looksLikeReport(JSON.parse(trimmed))
  } catch {
    return false
  }
}

function ReportCard({ report }: { report: RepoReportCard }) {
  const packages = report.mainPackages ?? []
  return (
    <article className="rounded-xl border border-orange-500/30 bg-gray-800 p-5 space-y-3">
      {report.name ? (
        <h3 className="text-lg font-semibold">{report.name}</h3>
      ) : null}
      {report.oneLiner ? <p>{report.oneLiner}</p> : null}
      {report.audience ? (
        <p className="text-sm text-gray-300">
          <span className="text-gray-500">Audience: </span>
          {report.audience}
        </p>
      ) : null}
      {packages.length > 0 ? (
        <ul className="list-disc pl-5 text-sm space-y-1">
          {packages.map((pkg, index) => (
            <li key={`${pkg.name ?? 'pkg'}-${index}`}>
              <span className="font-mono text-orange-200">
                {pkg.name ?? '…'}
              </span>
              {pkg.role ? `: ${pkg.role}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {report.howToRun ? (
        <p className="text-sm whitespace-pre-wrap">{report.howToRun}</p>
      ) : null}
    </article>
  )
}

function RepoReportPage() {
  const [threadId] = useState(() => crypto.randomUUID())
  const [harness, setHarness] = useState<ReportHarness>('claude-code')
  const [provider, setProvider] = useState<ReportProvider>('local')
  const [agent, setAgent] = useState<ReportAgent>('explainer')

  const chat = useChat({
    threadId,
    outputSchema: RepoReportSchema,
    connection: fetchServerSentEvents('/api/sandbox-repo-report'),
    forwardedProps: { harness, provider, agent, threadId },
  })

  const canRun = !chat.isLoading

  function run() {
    if (!canRun) return
    chat.clear()
    void chat.sendMessage(`Report on ${REPORT_REPO}`)
  }

  const report = chat.final ?? reportFromMessages(chat.messages)
  const last = chat.messages.at(-1)
  const waiting =
    chat.isLoading &&
    (last === undefined ||
      last.role === 'user' ||
      last.parts.every(
        (part) =>
          part.type !== 'text' &&
          part.type !== 'tool-call' &&
          part.type !== 'thinking' &&
          part.type !== 'structured-output',
      ))

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <header className="flex items-center gap-3 border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <BookOpen className="w-5 h-5 text-orange-400" />
        <div>
          <h2 className="text-xl font-semibold">Repo report</h2>
          <p className="text-sm text-gray-400">
            Clone {REPORT_REPO}, pick a harness (including ACP compatible), and
            grab a typed report from{' '}
            <code className="text-orange-400">messages[].parts</code> and{' '}
            <code className="text-orange-400">outputSchema</code>.
          </p>
        </div>
      </header>

      <div className="border-b border-orange-500/10 bg-gray-900/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Harness
          <select
            value={harness}
            onChange={(event) => {
              if (isReportHarness(event.target.value)) {
                setHarness(event.target.value)
              }
            }}
            disabled={chat.isLoading}
            className="rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white"
          >
            {Object.entries(REPORT_HARNESSES).map(([name, spec]) => (
              <option key={name} value={name}>
                {spec.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Sandbox
          <select
            value={provider}
            onChange={(event) => {
              if (isReportProvider(event.target.value)) {
                setProvider(event.target.value)
              }
            }}
            disabled={chat.isLoading}
            className="rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white"
          >
            {Object.entries(REPORT_PROVIDERS).map(([name, spec]) => (
              <option key={name} value={name}>
                {spec.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Agent
          <select
            value={agent}
            onChange={(event) => {
              if (isReportAgent(event.target.value)) {
                setAgent(event.target.value)
              }
            }}
            disabled={chat.isLoading}
            className="rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white"
          >
            {Object.entries(REPORT_AGENTS).map(([name, spec]) => (
              <option key={name} value={name}>
                {spec.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500">
          {REPORT_AGENTS[agent].hint}
        </span>
        {chat.isLoading ? (
          <button
            type="button"
            onClick={() => chat.stop()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Run
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {chat.error ? (
            <p className="text-red-300 text-sm whitespace-pre-wrap">
              {chat.error.message}
            </p>
          ) : null}

          {waiting ? (
            <p className="text-sm text-orange-200/80">
              Starting the sandbox and the agent. Tool calls and text show up
              here as they arrive. Codex can take a few minutes before the first
              line.
            </p>
          ) : null}

          {chat.messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'assistant'
                  ? 'rounded-lg bg-orange-500/5 p-4 space-y-2'
                  : 'text-gray-400 text-sm'
              }
            >
              {message.parts.map((part, index) => {
                if (part.type === 'thinking' && part.content) {
                  return (
                    <p
                      key={`think-${index}`}
                      className="text-xs text-gray-400 italic whitespace-pre-wrap"
                    >
                      {part.content}
                    </p>
                  )
                }
                if (part.type === 'text' && part.content) {
                  if (report && isCompleteReportJson(part.content)) return null
                  return (
                    <p key={`text-${index}`} className="whitespace-pre-wrap">
                      {part.content}
                    </p>
                  )
                }
                if (part.type === 'tool-call') {
                  return (
                    <p
                      key={part.id}
                      className="font-mono text-xs text-orange-200/80"
                    >
                      tool {part.name}
                      {part.state ? ` (${part.state})` : ''}
                    </p>
                  )
                }
                if (part.type === 'structured-output') {
                  const data = part.data ?? part.partial
                  if (!looksLikeReport(data)) return null
                  return <ReportCard key={`so-${index}`} report={data} />
                }
                return null
              })}
            </div>
          ))}

          {report &&
          !chat.messages.some((message) =>
            message.parts.some((part) => part.type === 'structured-output'),
          ) ? (
            <ReportCard report={report} />
          ) : null}

          {!chat.isLoading && chat.messages.length === 0 ? (
            <p className="text-center text-gray-500">
              Pick Claude Code, Grok Build, ACP compatible, or Codex, pick an
              agent, then Run. The sandbox clones {REPORT_REPO} and the typed
              report lands here.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
