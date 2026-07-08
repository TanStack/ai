import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_database-demo')({
  component: Outlet,
})
