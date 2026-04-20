import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_reporting')({
  component: Outlet,
})
