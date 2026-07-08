import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_structured-output')({
  component: Outlet,
})
