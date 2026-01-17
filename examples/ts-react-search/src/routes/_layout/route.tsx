import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout')({
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <main className="grow bg-linear-to-b from-slate-800 to-slate-900">
      <Outlet />
    </main>
  )
}
