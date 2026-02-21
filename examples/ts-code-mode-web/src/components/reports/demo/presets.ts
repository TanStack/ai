import type { UIEvent } from '@/lib/reports/types'

// NPM Package Card - demonstrates card with metrics and sparkline
export const npmPackageCardPreset: UIEvent[] = [
  {
    op: 'add',
    id: 'package-card',
    type: 'card',
    props: { title: 'react', subtitle: 'A JavaScript library for building user interfaces', variant: 'elevated', padding: 'md' },
  },
  {
    op: 'add',
    id: 'metrics-row',
    type: 'hbox',
    parentId: 'package-card',
    props: { gap: 'lg', justify: 'between', wrap: true },
  },
  {
    op: 'add',
    id: 'downloads-metric',
    type: 'metric',
    parentId: 'metrics-row',
    props: { value: 23400000, label: 'Downloads/week', format: 'compact', trend: '+12%' },
  },
  {
    op: 'add',
    id: 'stars-metric',
    type: 'metric',
    parentId: 'metrics-row',
    props: { value: 228000, label: 'GitHub Stars', format: 'compact' },
  },
  {
    op: 'add',
    id: 'version-badge',
    type: 'badge',
    parentId: 'metrics-row',
    props: { label: 'v19.0.0', variant: 'info' },
  },
  {
    op: 'add',
    id: 'trend-sparkline',
    type: 'sparkline',
    parentId: 'package-card',
    props: { data: [10, 12, 11, 15, 14, 18, 20, 19, 22, 25, 24, 28], height: 48, width: 200, type: 'area', showEndValue: true },
  },
]

// Comparison Grid - demonstrates grid layout with multiple cards
export const comparisonGridPreset: UIEvent[] = [
  {
    op: 'add',
    id: 'comparison-section',
    type: 'section',
    props: { title: 'Framework Comparison', defaultOpen: true },
  },
  {
    op: 'add',
    id: 'framework-grid',
    type: 'grid',
    parentId: 'comparison-section',
    props: { cols: 3, gap: 'md' },
  },
  // React card
  {
    op: 'add',
    id: 'react-card',
    type: 'card',
    parentId: 'framework-grid',
    props: { title: 'React', variant: 'outlined' },
  },
  {
    op: 'add',
    id: 'react-metric',
    type: 'metric',
    parentId: 'react-card',
    props: { value: 23.4, label: 'Downloads (M/week)', format: 'number', suffix: 'M' },
  },
  {
    op: 'add',
    id: 'react-progress',
    type: 'progress',
    parentId: 'react-card',
    props: { value: 95, label: 'Satisfaction', variant: 'success' },
  },
  // Vue card
  {
    op: 'add',
    id: 'vue-card',
    type: 'card',
    parentId: 'framework-grid',
    props: { title: 'Vue', variant: 'outlined' },
  },
  {
    op: 'add',
    id: 'vue-metric',
    type: 'metric',
    parentId: 'vue-card',
    props: { value: 4.8, label: 'Downloads (M/week)', format: 'number', suffix: 'M' },
  },
  {
    op: 'add',
    id: 'vue-progress',
    type: 'progress',
    parentId: 'vue-card',
    props: { value: 87, label: 'Satisfaction', variant: 'success' },
  },
  // Svelte card
  {
    op: 'add',
    id: 'svelte-card',
    type: 'card',
    parentId: 'framework-grid',
    props: { title: 'Svelte', variant: 'outlined' },
  },
  {
    op: 'add',
    id: 'svelte-metric',
    type: 'metric',
    parentId: 'svelte-card',
    props: { value: 1.2, label: 'Downloads (M/week)', format: 'number', suffix: 'M' },
  },
  {
    op: 'add',
    id: 'svelte-progress',
    type: 'progress',
    parentId: 'svelte-card',
    props: { value: 92, label: 'Satisfaction', variant: 'success' },
  },
]

// Stats Row - demonstrates horizontal layout with metrics
export const statsRowPreset: UIEvent[] = [
  {
    op: 'add',
    id: 'stats-container',
    type: 'card',
    props: { title: 'Project Statistics', variant: 'default' },
  },
  {
    op: 'add',
    id: 'stats-row',
    type: 'hbox',
    parentId: 'stats-container',
    props: { gap: 'xl', justify: 'around', wrap: true },
  },
  {
    op: 'add',
    id: 'users-metric',
    type: 'metric',
    parentId: 'stats-row',
    props: { value: 125000, label: 'Active Users', format: 'compact', trend: '+8.2%' },
  },
  {
    op: 'add',
    id: 'revenue-metric',
    type: 'metric',
    parentId: 'stats-row',
    props: { value: 89500, label: 'Monthly Revenue', format: 'currency', trend: '+15%' },
  },
  {
    op: 'add',
    id: 'conversion-metric',
    type: 'metric',
    parentId: 'stats-row',
    props: { value: 3.2, label: 'Conversion Rate', format: 'percent', trend: '-0.5%', trendDirection: 'down' },
  },
  {
    op: 'add',
    id: 'nps-metric',
    type: 'metric',
    parentId: 'stats-row',
    props: { value: 72, label: 'NPS Score', format: 'number', variant: 'success' },
  },
]

// Chart Demo - demonstrates different chart types
export const chartDemoPreset: UIEvent[] = [
  {
    op: 'add',
    id: 'chart-section',
    type: 'section',
    props: { title: 'Analytics Dashboard', defaultOpen: true },
  },
  {
    op: 'add',
    id: 'chart-grid',
    type: 'grid',
    parentId: 'chart-section',
    props: { cols: 2, gap: 'md' },
  },
  {
    op: 'add',
    id: 'line-chart-card',
    type: 'card',
    parentId: 'chart-grid',
    props: { title: 'Weekly Trends' },
  },
  {
    op: 'add',
    id: 'line-chart',
    type: 'chart',
    parentId: 'line-chart-card',
    props: {
      type: 'line',
      data: [
        { day: 'Mon', visits: 400, conversions: 24 },
        { day: 'Tue', visits: 300, conversions: 18 },
        { day: 'Wed', visits: 520, conversions: 32 },
        { day: 'Thu', visits: 480, conversions: 28 },
        { day: 'Fri', visits: 600, conversions: 42 },
        { day: 'Sat', visits: 350, conversions: 21 },
        { day: 'Sun', visits: 280, conversions: 16 },
      ],
      xKey: 'day',
      yKey: ['visits', 'conversions'],
      height: 250,
    },
  },
  {
    op: 'add',
    id: 'bar-chart-card',
    type: 'card',
    parentId: 'chart-grid',
    props: { title: 'Monthly Sales' },
  },
  {
    op: 'add',
    id: 'bar-chart',
    type: 'chart',
    parentId: 'bar-chart-card',
    props: {
      type: 'bar',
      data: [
        { month: 'Jan', sales: 4000 },
        { month: 'Feb', sales: 3000 },
        { month: 'Mar', sales: 5000 },
        { month: 'Apr', sales: 4500 },
        { month: 'May', sales: 6000 },
        { month: 'Jun', sales: 5500 },
      ],
      xKey: 'month',
      yKey: 'sales',
      height: 250,
    },
  },
  {
    op: 'add',
    id: 'pie-chart-card',
    type: 'card',
    parentId: 'chart-grid',
    props: { title: 'Traffic Sources' },
  },
  {
    op: 'add',
    id: 'pie-chart',
    type: 'chart',
    parentId: 'pie-chart-card',
    props: {
      type: 'donut',
      data: [
        { source: 'Organic', value: 45 },
        { source: 'Direct', value: 25 },
        { source: 'Social', value: 18 },
        { source: 'Referral', value: 12 },
      ],
      xKey: 'source',
      yKey: 'value',
      height: 250,
    },
  },
  {
    op: 'add',
    id: 'area-chart-card',
    type: 'card',
    parentId: 'chart-grid',
    props: { title: 'User Growth' },
  },
  {
    op: 'add',
    id: 'area-chart',
    type: 'chart',
    parentId: 'area-chart-card',
    props: {
      type: 'area',
      data: [
        { week: 'W1', users: 1200 },
        { week: 'W2', users: 1800 },
        { week: 'W3', users: 2400 },
        { week: 'W4', users: 3200 },
        { week: 'W5', users: 4100 },
        { week: 'W6', users: 5200 },
      ],
      xKey: 'week',
      yKey: 'users',
      height: 250,
    },
  },
]

// Data Table Demo - demonstrates sortable paginated table
export const dataTablePreset: UIEvent[] = [
  {
    op: 'add',
    id: 'table-section',
    type: 'section',
    props: { title: 'Top Packages', defaultOpen: true },
  },
  {
    op: 'add',
    id: 'packages-table',
    type: 'dataTable',
    parentId: 'table-section',
    props: {
      columns: [
        { key: 'name', label: 'Package', sortable: true },
        { key: 'downloads', label: 'Weekly Downloads', format: 'number', align: 'right', sortable: true },
        { key: 'stars', label: 'Stars', format: 'number', align: 'right', sortable: true },
        { key: 'version', label: 'Latest Version', align: 'center' },
      ],
      rows: [
        { name: 'react', downloads: 23400000, stars: 228000, version: '19.0.0' },
        { name: 'lodash', downloads: 52000000, stars: 59000, version: '4.17.21' },
        { name: 'axios', downloads: 45000000, stars: 105000, version: '1.7.2' },
        { name: 'typescript', downloads: 48000000, stars: 100000, version: '5.4.5' },
        { name: 'express', downloads: 32000000, stars: 64000, version: '4.19.2' },
        { name: 'next', downloads: 6500000, stars: 122000, version: '14.2.3' },
        { name: 'vue', downloads: 4800000, stars: 46000, version: '3.4.27' },
        { name: 'svelte', downloads: 1200000, stars: 77000, version: '4.2.17' },
      ],
      pageSize: 5,
      sortBy: 'downloads',
      sortDirection: 'desc',
    },
  },
]

// All presets for easy access
export const PRESETS = {
  'NPM Package Card': npmPackageCardPreset,
  'Comparison Grid': comparisonGridPreset,
  'Stats Row': statsRowPreset,
  'Chart Demo': chartDemoPreset,
  'Data Table': dataTablePreset,
}

// Helper function to run preset with delays
export async function runPreset(
  events: UIEvent[],
  dispatch: (e: UIEvent) => void,
  delayMs = 200
) {
  for (const event of events) {
    dispatch(event)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
