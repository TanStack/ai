/**
 * Open Generative UI Specification (Draft 0.1)
 * Canonical 9 Fixtures covering U1-U8 and Vector Scene (§6.4.3).
 */

import type { GraphDocument } from '../types'

/**
 * U1: Compare
 * Options side by side, same attributes, differences visible.
 */
export const comparePlansBasicFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_compare_plans_01',
  revision: 1,
  title: 'Compare Hosting Plans',
  fallbackText: 'Starter: $10/mo, 2 CPUs, 4GB RAM. Pro: $25/mo, 4 CPUs, 8GB RAM, Priority Support. Enterprise: $80/mo, 16 CPUs, 32GB RAM, 24/7 SLA.',
  provenance: {
    driver: 'fixture',
    sourceId: 'compare-plans-basic',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'heading-text',
        type: 'Text',
        props: {
          content: 'Choose the best plan for your deployment scale:',
          variant: 'heading',
        },
      },
      {
        id: 'plan-columns',
        type: 'Columns',
        props: { count: 3, gap: 'md' },
        children: [
          {
            id: 'plan-starter',
            type: 'Section',
            props: { title: 'Starter' },
            children: [
              { id: 'starter-price', type: 'Metric', props: { label: 'Monthly', value: '$10', unit: '/mo' } },
              { id: 'starter-cpu', type: 'Text', props: { content: '• 2 vCPUs\n• 4 GB RAM\n• Community Support' } },
              { id: 'starter-btn', type: 'Button', props: { label: 'Select Starter', tone: 'secondary' }, on: { click: { intent: 'selectPlan', payload: { plan: 'starter' } } } },
            ],
          },
          {
            id: 'plan-pro',
            type: 'Section',
            props: { title: 'Pro (Recommended)' },
            children: [
              { id: 'pro-price', type: 'Metric', props: { label: 'Monthly', value: '$25', unit: '/mo', tone: 'positive' } },
              { id: 'pro-cpu', type: 'Text', props: { content: '• 4 vCPUs\n• 8 GB RAM\n• Priority Support' } },
              { id: 'pro-btn', type: 'Button', props: { label: 'Select Pro', tone: 'primary' }, on: { click: { intent: 'selectPlan', payload: { plan: 'pro' } } } },
            ],
          },
          {
            id: 'plan-enterprise',
            type: 'Section',
            props: { title: 'Enterprise' },
            children: [
              { id: 'ent-price', type: 'Metric', props: { label: 'Monthly', value: '$80', unit: '/mo' } },
              { id: 'ent-cpu', type: 'Text', props: { content: '• 16 vCPUs\n• 32 GB RAM\n• 24/7 Phone SLA' } },
              { id: 'ent-btn', type: 'Button', props: { label: 'Select Enterprise', tone: 'secondary' }, on: { click: { intent: 'selectPlan', payload: { plan: 'enterprise' } } } },
            ],
          },
        ],
      },
    ],
  },
}

/**
 * U2: Understand
 * Explorable system/process with hotspots.
 */
export const bicycleDrivetrainFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_bicycle_drivetrain_02',
  revision: 1,
  title: 'Bicycle Drivetrain Mechanics',
  fallbackText: 'Pedal & Crankset transfers rider effort into rotation. Chain transfers torque to the rear cassette. Rear Derailleur changes gear ratios. Rear Wheel delivers traction.',
  provenance: {
    driver: 'fixture',
    sourceId: 'bicycle-drivetrain',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'overview-callout',
        type: 'Callout',
        props: {
          tone: 'info',
          title: 'Mechanical System Overview',
          text: 'Select any drivetrain component below to inspect its role and maintenance requirements.',
        },
      },
      {
        id: 'drivetrain-diagram',
        type: 'Diagram',
        props: {
          title: 'Drivetrain Anatomy',
          hotspots: [
            { id: 'crank', label: 'Crankset & Chainring', explanation: 'Converts pedal leg force into rotational chain tension. Inspect teeth for shark-fin wear.' },
            { id: 'chain', label: 'Bicycle Chain', explanation: 'Transfers rotational power over the wheelbase. Lubricate weekly; replace at 0.75% stretch.' },
            { id: 'derailleur', label: 'Rear Derailleur', explanation: 'Maintains chain tension and guides the chain across rear sprockets.' },
            { id: 'cassette', label: 'Rear Cassette', explanation: 'Stack of sprockets offering mechanical gear ratios for climbing and flat sprints.' },
          ],
        },
        bind: { selected: 'selectedPart' },
      },
    ],
  },
}

/**
 * U3: Plan & Track
 * Sequence with steps that can be followed and checked off.
 */
export const cookingPlanFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_cooking_plan_03',
  revision: 1,
  title: 'Pasta Carbonara Preparation Plan',
  fallbackText: 'Step 1: Boil salted pasta water. Step 2: Crisp pancetta/guanciale in skillet. Step 3: Whisk egg yolks, pecorino, black pepper. Step 4: Toss hot pasta off heat with egg mixture.',
  provenance: {
    driver: 'fixture',
    sourceId: 'cooking-plan',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'timeline-steps',
        type: 'Timeline',
        props: { currentStep: 2 },
        children: [
          { id: 's1', type: 'Text', props: { content: '1. Prep Station (5 min)', variant: 'heading' } },
          { id: 's2', type: 'Text', props: { content: '2. Crisp Pancetta (8 min)', variant: 'heading' } },
          { id: 's3', type: 'Text', props: { content: '3. Cook Rigatoni (10 min)', variant: 'heading' } },
          { id: 's4', type: 'Text', props: { content: '4. Emulsify & Serve (3 min)', variant: 'heading' } },
        ],
      },
      {
        id: 'checklist-section',
        type: 'Section',
        props: { title: 'Preparation Checklist' },
        children: [
          {
            id: 'tasks',
            type: 'Checklist',
            props: {
              items: [
                { id: 'water', label: 'Bring 4L water to a boil with 2 tbsp kosher salt', defaultDone: true },
                { id: 'dice', label: 'Dice 150g guanciale or pancetta into 1/2-inch batons', defaultDone: true },
                { id: 'eggs', label: 'Whisk 3 large egg yolks + 1 whole egg with 60g Pecorino Romano', defaultDone: false },
                { id: 'pepper', label: 'Coarsely crush 2 tsp whole black peppercorns', defaultDone: false },
                { id: 'water-reserve', label: 'Reserve 1 cup starchy pasta cooking water before draining', defaultDone: false },
              ],
            },
            bind: { state: 'checklistProgress' },
          },
        ],
      },
    ],
  },
}

/**
 * U4: Calculate / explore parameters
 * Change an input, see results update — computed by code, NOT by LLM!
 */
export const billSplitFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_bill_split_04',
  revision: 1,
  title: 'Dinner Bill Splitter',
  fallbackText: 'Calculate tip and bill split per person with subtotal, tip percentage slider, and guest count stepper.',
  provenance: {
    driver: 'fixture',
    sourceId: 'bill-split',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'inputs-section',
        type: 'Section',
        props: { title: 'Bill Details' },
        children: [
          {
            id: 'subtotal-input',
            type: 'NumberInput',
            props: { label: 'Subtotal ($)', min: 0, step: 1 },
            bind: { value: 'subtotal' },
          },
          {
            id: 'tip-slider',
            type: 'Slider',
            props: { label: 'Tip Percentage (%)', min: 10, max: 30, step: 1 },
            bind: { value: 'tipPercent' },
          },
          {
            id: 'guests-stepper',
            type: 'Stepper',
            props: { label: 'Number of Guests', min: 1, max: 20, step: 1 },
            bind: { value: 'splitCount' },
          },
        ],
      },
      {
        id: 'computation-node',
        type: 'Stack',
        compute: {
          name: 'billSplit',
          inputs: {
            subtotal: 'subtotal',
            tipPercent: 'tipPercent',
            splitCount: 'splitCount',
          },
          output: 'computedBill',
        },
        children: [
          {
            id: 'results-section',
            type: 'Section',
            props: { title: 'Calculated Totals (Computed by Host Code)' },
            children: [
              {
                id: 'metrics-columns',
                type: 'Columns',
                props: { count: 3, gap: 'md' },
                children: [
                  {
                    id: 'tip-metric',
                    type: 'Metric',
                    props: { label: 'Tip Amount', value: '$18.00' },
                    bind: { value: 'computedBill.tipAmount', unit: 'USD' },
                  },
                  {
                    id: 'total-metric',
                    type: 'Metric',
                    props: { label: 'Total with Tip', value: '$118.00' },
                    bind: { value: 'computedBill.total', unit: 'USD' },
                  },
                  {
                    id: 'per-person-metric',
                    type: 'Metric',
                    props: { label: 'Per Person', value: '$29.50', tone: 'positive' },
                    bind: { value: 'computedBill.perPerson', unit: 'USD' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}

/**
 * U5: Collect structured input
 * Form whose result goes back to the agent as data, not prose.
 */
export const recipeParametersFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_recipe_params_05',
  revision: 1,
  title: 'Recipe Customizer',
  fallbackText: 'Configure meal type, dietary restrictions, spice level, and target cooking time.',
  provenance: {
    driver: 'fixture',
    sourceId: 'recipe-parameters',
  },
  root: {
    id: 'form-root',
    type: 'Form',
    props: {
      submitLabel: 'Generate Tailored Recipe',
      submitIntent: 'createCustomRecipe',
    },
    children: [
      {
        id: 'cuisine-select',
        type: 'Select',
        props: {
          label: 'Cuisine Style',
          options: [
            { value: 'italian', label: 'Italian' },
            { value: 'mexican', label: 'Mexican' },
            { value: 'japanese', label: 'Japanese' },
            { value: 'mediterranean', label: 'Mediterranean' },
          ],
        },
        bind: { value: 'cuisine' },
      },
      {
        id: 'spice-slider',
        type: 'Slider',
        props: { label: 'Spice Level (1 = Mild, 5 = Fiery)', min: 1, max: 5, step: 1 },
        bind: { value: 'spiceLevel' },
      },
      {
        id: 'vegetarian-toggle',
        type: 'Toggle',
        props: { label: 'Vegetarian Only' },
        bind: { value: 'isVegetarian' },
      },
      {
        id: 'notes-input',
        type: 'TextInput',
        props: { label: 'Pantry Ingredients to Prioritize', placeholder: 'e.g. cherry tomatoes, zucchini, basil' },
        bind: { value: 'ingredients' },
      },
    ],
  },
}

/**
 * U6: Decide / approve
 * Proposal presented with consequences and explicit approve/reject act.
 */
export const approvalToolCallFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_approval_tool_06',
  revision: 1,
  title: 'Approval Required: Production Database Migration',
  fallbackText: 'Agent requests permission to apply migration "20261014_add_audit_index". Estimated downtime: 0s. Estimated cost: $0. Requires table lock for ~150ms.',
  provenance: {
    driver: 'fixture',
    sourceId: 'approval-tool-call',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'warning-callout',
        type: 'Callout',
        props: {
          tone: 'warning',
          title: 'Action Requires Human Authorization',
          text: 'This operation will run against the primary cluster `db-prod-east`. Read traffic will remain active, but writes will briefly queue.',
        },
      },
      {
        id: 'details-section',
        type: 'Section',
        props: { title: 'Proposed Tool Call Details' },
        children: [
          {
            id: 'diff-text',
            type: 'Text',
            props: {
              content: '```sql\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_tenant_created\nON audit_logs (tenant_id, created_at DESC);\n```',
              variant: 'code',
            },
          },
        ],
      },
      {
        id: 'choice-actions',
        type: 'Choice',
        props: {
          label: 'Decision',
          options: [
            { id: 'approve', label: 'Approve & Execute Now', description: 'Proceed immediately with the migration.' },
            { id: 'reject', label: 'Reject / Cancel', description: 'Abort the tool call and notify the agent.' },
          ],
        },
        on: {
          select: {
            intent: 'decideToolCall',
            payload: { toolCallId: 'tc_migrate_982' },
          },
        },
      },
    ],
  },
}

/**
 * U7: Monitor
 * Live-ish values and trends, glanceable metrics and charts.
 */
export const spendMonitorFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_spend_monitor_07',
  revision: 1,
  title: 'Agent Pod Spend & Health',
  fallbackText: 'Daily Spend: $42.50 (+12%). Monthly Forecast: $1,280. Active Agents: 6. 7-day spend trend and running worker table.',
  provenance: {
    driver: 'fixture',
    sourceId: 'spend-monitor',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'summary-columns',
        type: 'Columns',
        props: { count: 3, gap: 'md' },
        children: [
          { id: 'metric-daily', type: 'Metric', props: { label: 'Today Spend', value: '$42.50', delta: '+12%', tone: 'positive' } },
          { id: 'metric-forecast', type: 'Metric', props: { label: 'Month Forecast', value: '$1,280', delta: '-4%', tone: 'neutral' } },
          { id: 'metric-agents', type: 'Metric', props: { label: 'Active Agents', value: '6 / 8', tone: 'neutral' } },
        ],
      },
      {
        id: 'trend-chart',
        type: 'Chart',
        props: {
          kind: 'bar',
          title: 'Daily Spend (Past 7 Days)',
          unit: 'USD',
          data: [
            { label: 'Thu', value: 28 },
            { label: 'Fri', value: 34 },
            { label: 'Sat', value: 18 },
            { label: 'Sun', value: 12 },
            { label: 'Mon', value: 45 },
            { label: 'Tue', value: 39 },
            { label: 'Wed', value: 42.5 },
          ],
        },
      },
      {
        id: 'workers-table',
        type: 'Table',
        props: {
          columns: [
            { key: 'agent', label: 'Agent Name' },
            { key: 'status', label: 'Status' },
            { key: 'requests', label: 'Tokens Processed' },
            { key: 'cost', label: 'Cost Today' },
          ],
          rows: [
            { agent: 'research-scout', status: 'Active', requests: '142,800', cost: '$14.28' },
            { agent: 'code-reviewer', status: 'Active', requests: '89,400', cost: '$18.12' },
            { agent: 'doc-sync', status: 'Idle', requests: '21,000', cost: '$4.20' },
            { agent: 'test-runner', status: 'Active', requests: '32,100', cost: '$5.90' },
          ],
        },
      },
    ],
  },
}

/**
 * U8: Locate
 * Things in space, with notes and routes.
 */
export const tripStopsFixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_trip_stops_08',
  revision: 1,
  title: 'Pacific Coast Highway Itinerary',
  fallbackText: 'Stop 1: Monterey Bay Aquarium. Stop 2: Bixby Creek Bridge. Stop 3: Pfeiffer Beach. Stop 4: McWay Falls.',
  provenance: {
    driver: 'fixture',
    sourceId: 'trip-stops',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'map-view',
        type: 'Map',
        props: {
          center: { lat: 36.3, lng: -121.8 },
          markers: [
            { id: 'm1', label: 'Monterey Bay Aquarium', lat: 36.618, lng: -121.901, note: 'World-class kelp forest exhibit' },
            { id: 'm2', label: 'Bixby Creek Bridge', lat: 36.371, lng: -121.901, note: 'Iconic coastal span viewpoint' },
            { id: 'm3', label: 'Pfeiffer Beach', lat: 36.238, lng: -121.815, note: 'Purple sand & Keyhole Arch' },
            { id: 'm4', label: 'McWay Falls', lat: 36.157, lng: -121.672, note: '80-foot waterfall dropping onto pristine cove' },
          ],
        },
      },
      {
        id: 'stops-list',
        type: 'List',
        props: {
          ordered: true,
          items: [
            { text: 'Monterey Bay Aquarium', subtitle: 'Arrive 09:30 AM — reserve parking ahead' },
            { text: 'Bixby Creek Bridge', subtitle: 'Pull out on northbound shoulder for best photo angle' },
            { text: 'Pfeiffer Beach', subtitle: 'Narrow 2-mile road — cash fee at entry gate' },
            { text: 'McWay Falls Overlook', subtitle: 'Short flat 0.5-mile trail from highway parking' },
          ],
        },
      },
    ],
  },
}

/**
 * §6.4.3: Guitar Chord Diagram (Emaj7)
 * The canonical Scene workload: geometry derived from tuning & voicing.
 */
export const chordDiagramEmaj7Fixture: GraphDocument = {
  specVersion: '0.1',
  graphId: 'g_chord_emaj7_09',
  revision: 1,
  title: 'Guitar Voicing: Open Emaj7',
  fallbackText: 'Open Emaj7 chord (0-2-1-1-0-0): Low E (Root), B (5th, 2nd fret), D# (Maj 7th, 1st fret), G# (Maj 3rd, 1st fret), B (5th, open), High E (Root, open).',
  provenance: {
    driver: 'fixture',
    sourceId: 'chord-diagram-emaj7',
  },
  root: {
    id: 'root-stack',
    type: 'Stack',
    props: { gap: 'md' },
    children: [
      {
        id: 'chord-scene',
        type: 'Scene',
        props: {
          viewBox: '0 0 300 320',
          width: 300,
          height: 320,
          shapes: [
            // Nut (thick top bar)
            { kind: 'rect', x: 40, y: 35, width: 220, height: 8, fill: 'neutral' },
            // Fret lines (frets 1 to 4)
            { kind: 'line', x1: 40, y1: 100, x2: 260, y2: 100, stroke: 'muted', strokeWidth: 2 },
            { kind: 'line', x1: 40, y1: 160, x2: 260, y2: 160, stroke: 'muted', strokeWidth: 2 },
            { kind: 'line', x1: 40, y1: 220, x2: 260, y2: 220, stroke: 'muted', strokeWidth: 2 },
            { kind: 'line', x1: 40, y1: 280, x2: 260, y2: 280, stroke: 'muted', strokeWidth: 2 },
            // 6 Strings (vertical lines from low E to high e)
            { kind: 'line', x1: 50, y1: 35, x2: 50, y2: 280, stroke: 'neutral', strokeWidth: 3 }, // 6th string (E)
            { kind: 'line', x1: 86, y1: 35, x2: 86, y2: 280, stroke: 'neutral', strokeWidth: 2.5 }, // 5th string (A)
            { kind: 'line', x1: 122, y1: 35, x2: 122, y2: 280, stroke: 'neutral', strokeWidth: 2 }, // 4th string (D)
            { kind: 'line', x1: 158, y1: 35, x2: 158, y2: 280, stroke: 'neutral', strokeWidth: 1.5 }, // 3rd string (G)
            { kind: 'line', x1: 194, y1: 35, x2: 194, y2: 280, stroke: 'neutral', strokeWidth: 1.2 }, // 2nd string (B)
            { kind: 'line', x1: 230, y1: 35, x2: 230, y2: 280, stroke: 'neutral', strokeWidth: 1 }, // 1st string (e)
            // Open string markers (circle at top)
            { kind: 'circle', id: 'open-6', cx: 50, cy: 20, r: 6, stroke: 'neutral', fill: 'none', label: 'String 6: Open E (Root)' },
            { kind: 'circle', id: 'open-2', cx: 194, cy: 20, r: 6, stroke: 'neutral', fill: 'none', label: 'String 2: Open B (5th)' },
            { kind: 'circle', id: 'open-1', cx: 230, cy: 20, r: 6, stroke: 'neutral', fill: 'none', label: 'String 1: Open E (Root)' },
            // Fingered note dots with declared interactivity (§6.4.2)
            {
              kind: 'circle',
              id: 'note-b-5',
              cx: 86,
              cy: 130, // Fret 2
              r: 12,
              fill: 'accent',
              label: 'B — Perfect 5th (5th string, 2nd fret)',
              bind: { selected: 'selectedNote' },
              on: { select: 'noteSelected' },
            },
            {
              kind: 'circle',
              id: 'note-ds-4',
              cx: 122,
              cy: 70, // Fret 1
              r: 12,
              fill: 'accent',
              label: 'D♯ — Major 7th (4th string, 1st fret)',
              bind: { selected: 'selectedNote' },
              on: { select: 'noteSelected' },
            },
            {
              kind: 'circle',
              id: 'note-gs-3',
              cx: 158,
              cy: 70, // Fret 1
              r: 12,
              fill: 'accent',
              label: 'G♯ — Major 3rd (3rd string, 1st fret)',
              bind: { selected: 'selectedNote' },
              on: { select: 'noteSelected' },
            },
            // Text labels for note dots
            { kind: 'text', x: 86, y: 134, text: '5', fill: 'surface', sizeRole: 'sm' },
            { kind: 'text', x: 122, y: 74, text: '7', fill: 'surface', sizeRole: 'sm' },
            { kind: 'text', x: 158, y: 74, text: '3', fill: 'surface', sizeRole: 'sm' },
          ],
        },
      },
      {
        id: 'selected-note-callout',
        type: 'Callout',
        props: {
          tone: 'info',
          title: 'Chord Voicing Formula: 1 - 5 - 7 - 3 - 5 - 1',
          text: 'Emaj7 creates a warm, dreamy jazz and neo-soul harmony. Select note markers in the diagram to inspect their harmonic interval.',
        },
      },
    ],
  },
}

export const CANONICAL_FIXTURES: Record<string, GraphDocument> = {
  'compare-plans-basic': comparePlansBasicFixture,
  'bicycle-drivetrain': bicycleDrivetrainFixture,
  'cooking-plan': cookingPlanFixture,
  'bill-split': billSplitFixture,
  'recipe-parameters': recipeParametersFixture,
  'approval-tool-call': approvalToolCallFixture,
  'spend-monitor': spendMonitorFixture,
  'trip-stops': tripStopsFixture,
  'chord-diagram-emaj7': chordDiagramEmaj7Fixture,
}
