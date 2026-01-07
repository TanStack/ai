import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// Sample add-ons data
export const availableAddOns = [
  {
    id: 'clerk',
    name: 'Clerk Authentication',
    description:
      'Complete user management and authentication solution with social logins, MFA, and session management.',
    type: 'authentication',
  },
  {
    id: 'stripe',
    name: 'Stripe Payments',
    description:
      'Accept payments and manage subscriptions with the leading payment processing platform.',
    type: 'payments',
  },
  {
    id: 'drizzle',
    name: 'Drizzle ORM',
    description:
      'TypeScript-first ORM with excellent DX, type safety, and SQL-like query builder.',
    type: 'database',
  },
  {
    id: 'prisma',
    name: 'Prisma ORM',
    description:
      'Next-generation ORM with intuitive data modeling, automated migrations, and type safety.',
    type: 'database',
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    description:
      'Utility-first CSS framework for rapidly building custom user interfaces.',
    type: 'styling',
  },
  {
    id: 'shadcn',
    name: 'shadcn/ui',
    description:
      'Beautifully designed components built with Radix UI and Tailwind CSS.',
    type: 'ui-components',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description:
      'Error tracking and performance monitoring for your application.',
    type: 'monitoring',
  },
  {
    id: 'posthog',
    name: 'PostHog',
    description:
      'Product analytics, session recording, and feature flags in one platform.',
    type: 'analytics',
  },
]

// Tool 1: Get available add-ons with their current selection state
export const getAvailableAddOnsToolDef = toolDefinition({
  name: 'getAvailableAddOns',
  description:
    'Get all available add-ons that can be selected for the project. Returns the list of add-ons with their id, name, description, type, and current selection state.',
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      type: z.string(),
      selected: z.boolean(),
      enabled: z.boolean(),
    }),
  ),
})

// Tool 2: Select add-ons by ID
export const selectAddOnsToolDef = toolDefinition({
  name: 'selectAddOns',
  description:
    'Select one or more add-ons by their IDs. This will enable the specified add-ons for the project.',
  inputSchema: z.object({
    addOnIds: z
      .array(z.string())
      .describe('Array of add-on IDs to select/enable'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    selectedAddOns: z.array(z.string()),
    message: z.string(),
  }),
})

// Tool 3: Unselect add-ons by ID
export const unselectAddOnsToolDef = toolDefinition({
  name: 'unselectAddOns',
  description:
    'Unselect one or more add-ons by their IDs. This will disable the specified add-ons for the project.',
  inputSchema: z.object({
    addOnIds: z
      .array(z.string())
      .describe('Array of add-on IDs to unselect/disable'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    unselectedAddOns: z.array(z.string()),
    message: z.string(),
  }),
})
