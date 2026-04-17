import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_npm-github-chat')({
  component: Outlet,
})
