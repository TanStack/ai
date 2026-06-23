import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_sandbox-agent')({
  component: Outlet,
})
