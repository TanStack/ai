import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          <span className="text-[var(--accent)]">Stream</span> Processor Test
          Panel
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Visual validation for chunk stream processing
        </p>
      </header>
      <Outlet />
    </div>
  ),
})
