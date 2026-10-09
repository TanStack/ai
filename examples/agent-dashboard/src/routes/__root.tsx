import {
  ClientOnly,
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import {
  ChatTeardropDotsIcon,
  ClockCounterClockwiseIcon,
  CoinsIcon,
  MoonIcon,
  SlidersHorizontalIcon,
  SunIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { getQueryClient } from '@/lib/query'
import { hydrateRoster } from '@/lib/session-controller'
import { channels, teams } from '@/db/collections'
import { DemoControlsPanel } from '@/components/demo-controls'
import { TanStackMark } from '@/components/ui'
import appCss from '../styles.css?url'
import type { ChannelRow, TeamRow } from '@/db/collections'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack AI' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Inter:wght@300;400;500&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
})

/** Seed the team roster from the server once, so teams survive a reload. */
function RosterHydrator() {
  useEffect(() => {
    void hydrateRoster()
  }, [])
  return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.dataset.theme=localStorage.getItem('theme')||'dark'`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={getQueryClient()}>
          <RosterHydrator />
          <div className="flex h-screen">
            <Rail />
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </div>
          {/* Inside the provider so the demo-controls plugin (portaled but still
              in this React subtree) gets the QueryClient its panels use. */}
          <TanStackDevtools
            config={{
              position: 'bottom-left',
              // Open on load only under E2E so specs can reach the demo controls;
              // real users open it themselves.
              defaultOpen: import.meta.env.VITE_E2E === '1',
            }}
            plugins={[
              {
                id: 'demo-controls',
                name: 'Demo Controls',
                // Land on this tab first when the panel is opened.
                defaultOpen: true,
                render: <DemoControlsPanel />,
              },
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
            eventBusConfig={{ connectToServerBus: false }}
          />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}

const NAV = [
  { to: '/', label: 'Agents', Icon: UsersThreeIcon },
  { to: '/chat', label: 'Meta-chat', Icon: ChatTeardropDotsIcon },
  { to: '/history', label: 'History', Icon: ClockCounterClockwiseIcon },
  { to: '/spend', label: 'Spend', Icon: CoinsIcon },
  { to: '/config', label: 'Config', Icon: SlidersHorizontalIcon },
] as const

function Rail() {
  // Bottom padding clears the floating devtools trigger (bottom-left).
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 bg-surface-raised px-3 pt-[18px] pb-16">
      <Link to="/" className="flex items-center gap-2 px-1.5">
        <TanStackMark className="h-[22px] w-auto text-ink" />
        <span className="font-display text-base font-bold">TanStack AI</span>
      </Link>

      {/* Live DB queries have no server snapshot, so team nav renders client-side. */}
      <ClientOnly fallback={<div className="flex-1" />}>
        <TeamNav />
      </ClientOnly>

      <nav className="space-y-0.5 border-t border-line pt-3">
        {NAV.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="nav-row"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
        <ThemeToggle />
      </nav>
    </aside>
  )
}

function TeamNav() {
  const navigate = useNavigate()
  const { teamId } = useParams({ strict: false })
  const { data: teamRows = [] } = useLiveQuery((q) => q.from({ t: teams }))

  return (
    <>
      {(teamRows as Array<TeamRow>).length > 0 && (
        <select
          aria-label="team"
          value={teamId ?? ''}
          onChange={(e) =>
            e.target.value &&
            navigate({
              to: '/teams/$teamId',
              params: { teamId: e.target.value },
            })
          }
          className="input w-full cursor-pointer py-2 font-medium"
        >
          <option value="" disabled>
            Select a team
          </option>
          {(teamRows as Array<TeamRow>).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {teamId && <ChannelList teamId={teamId} />}
      </div>
    </>
  )
}

const kindOrder: Record<ChannelRow['kind'], number> = {
  main: 0,
  dynamic: 1,
  dm: 2,
}
const GROUPS = [
  ['main', 'Main'],
  ['dynamic', 'Dynamic'],
  ['dm', 'Direct'],
] as const

/** The team's channels, grouped. Hidden while the team has a single channel. */
function ChannelList({ teamId }: { teamId: string }) {
  const navigate = useNavigate()
  const { channel: selected } = useSearch({ strict: false })
  const { data: chans = [] } = useLiveQuery(
    (q) => q.from({ c: channels }).where(({ c }) => eq(c.teamId, teamId)),
    [teamId],
  )
  const rows = [...(chans as Array<ChannelRow>)].sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] || a.createdAt - b.createdAt,
  )
  if (rows.length < 2) return null
  const activeId =
    selected && rows.some((c) => c.id === selected)
      ? selected
      : rows.find((c) => c.kind === 'main')?.id

  return (
    <div className="space-y-4">
      {GROUPS.map(([kind, label]) => {
        const group = rows.filter((c) => c.kind === kind)
        if (group.length === 0) return null
        return (
          <div key={kind} className="space-y-0.5">
            <div className="label px-2 pb-1">{label}</div>
            {group.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  navigate({
                    to: '/teams/$teamId',
                    params: { teamId },
                    search: { channel: c.id },
                  })
                }
                title={c.topic ?? c.name}
                className={`nav-row ${c.id === activeId ? 'active' : ''}`}
              >
                <span
                  className={c.id === activeId ? 'text-accent' : 'text-ink-3'}
                >
                  {c.kind === 'dm' ? '@ ' : '# '}
                </span>
                <span className="truncate">
                  {c.kind === 'main' ? 'main' : c.name}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    )
  }, [])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
    setTheme(next)
  }
  return (
    <button onClick={toggle} className="nav-row">
      {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      {theme === 'dark' ? 'Light theme' : 'Dark theme'}
    </button>
  )
}
