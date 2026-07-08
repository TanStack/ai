import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  Terminal,
  Wrench,
} from 'lucide-react'

// LLM Tools - tools the LLM can call directly
export interface LLMTool {
  name: string
  description: string
}

// Isolate VM options
export type IsolateVM = 'node' | 'quickjs' | 'cloudflare'

export interface IsolateVMOption {
  id: IsolateVM
  name: string
  description: string
  available: boolean
}

// Isolate VM Tools - external_* functions available inside the sandbox
export interface IsolateVMTool {
  name: string
  externalName: string
  description: string
  category: string
}

// Collapsible section component
interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  iconColorClass: string
  titleColorClass: string
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  icon,
  iconColorClass,
  titleColorClass,
  defaultOpen = true,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <span className={iconColorClass}>{icon}</span>
        <h3
          className={`text-sm font-semibold uppercase tracking-wide ${titleColorClass}`}
        >
          {title}
        </h3>
        {badge}
      </button>
      {isOpen && children}
    </section>
  )
}

// Default tool configurations
export const DEFAULT_LLM_TOOLS: Array<LLMTool> = [
  {
    name: 'execute_typescript',
    description: 'Runs TypeScript code in a sandboxed environment',
  },
  {
    name: 'export_conversation_to_pdf',
    description: 'Exports the conversation to a downloadable PDF',
  },
]

export const DEFAULT_ISOLATE_VM_OPTIONS: Array<IsolateVMOption> = [
  {
    id: 'node',
    name: 'Node.js (isolated-vm)',
    description: 'V8 isolate with full Node.js API access',
    available: true,
  },
  {
    id: 'quickjs',
    name: 'QuickJS',
    description: 'Lightweight JavaScript engine',
    available: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers',
    description: 'Edge runtime isolate (requires wrangler dev)',
    available: true,
  },
]

export const DEFAULT_ISOLATE_VM_TOOLS: Array<IsolateVMTool> = [
  // GitHub tools
  {
    name: 'getStarredRepos',
    externalName: 'external_getStarredRepos',
    description: 'Fetch starred repos for a user',
    category: 'github',
  },
  {
    name: 'getRepoDetails',
    externalName: 'external_getRepoDetails',
    description: 'Get repo info (stars, forks, issues)',
    category: 'github',
  },
  {
    name: 'getRepoReleases',
    externalName: 'external_getRepoReleases',
    description: 'Get release history',
    category: 'github',
  },
  {
    name: 'getRepoContributors',
    externalName: 'external_getRepoContributors',
    description: 'Get top contributors',
    category: 'github',
  },
  {
    name: 'searchRepositories',
    externalName: 'external_searchRepositories',
    description: 'Search GitHub repos',
    category: 'github',
  },
  // NPM tools
  {
    name: 'getNpmPackageInfo',
    externalName: 'external_getNpmPackageInfo',
    description: 'Get package metadata',
    category: 'npm',
  },
  {
    name: 'createNPMComparison',
    externalName: 'external_createNPMComparison',
    description: 'Create a comparison session',
    category: 'npm',
  },
  {
    name: 'addToNPMComparison',
    externalName: 'external_addToNPMComparison',
    description: 'Add a package to a comparison',
    category: 'npm',
  },
  {
    name: 'executeNPMComparison',
    externalName: 'external_executeNPMComparison',
    description: 'Run a comparison by ID',
    category: 'npm',
  },
  // Utility tools
  {
    name: 'getCurrentDate',
    externalName: 'external_getCurrentDate',
    description: 'Get current date/time',
    category: 'utility',
  },
  {
    name: 'calculateStats',
    externalName: 'external_calculateStats',
    description: 'Calculate statistics',
    category: 'utility',
  },
  {
    name: 'formatDateRange',
    externalName: 'external_formatDateRange',
    description: 'Format date ranges',
    category: 'utility',
  },
]

// Audio-specific VM tools
export const AUDIO_ISOLATE_VM_TOOLS: Array<IsolateVMTool> = [
  // Audio I/O tools
  {
    name: 'audio_load',
    externalName: 'external_audio_load',
    description: 'Load audio from file, mic, or storage',
    category: 'audio',
  },
  {
    name: 'audio_store',
    externalName: 'external_audio_store',
    description: 'Store audio with a name',
    category: 'audio',
  },
  {
    name: 'audio_list',
    externalName: 'external_audio_list',
    description: 'List stored audio files',
    category: 'audio',
  },
  {
    name: 'audio_play',
    externalName: 'external_audio_play',
    description: 'Play stored audio',
    category: 'audio',
  },
  {
    name: 'audio_delete',
    externalName: 'external_audio_delete',
    description: 'Delete stored audio',
    category: 'audio',
  },
  // DSP tools
  {
    name: 'dsp_fft',
    externalName: 'external_dsp_fft',
    description: 'Compute FFT spectrum',
    category: 'dsp',
  },
  {
    name: 'dsp_welch',
    externalName: 'external_dsp_welch',
    description: 'Welch power spectral density',
    category: 'dsp',
  },
  {
    name: 'dsp_filter',
    externalName: 'external_dsp_filter',
    description: 'Apply audio filters',
    category: 'dsp',
  },
  {
    name: 'dsp_eq',
    externalName: 'external_dsp_eq',
    description: 'Apply parametric EQ',
    category: 'dsp',
  },
  {
    name: 'dsp_normalize',
    externalName: 'external_dsp_normalize',
    description: 'Normalize audio level',
    category: 'dsp',
  },
  // Analysis tools
  {
    name: 'analyze_rms',
    externalName: 'external_analyze_rms',
    description: 'Measure RMS level',
    category: 'analyze',
  },
  {
    name: 'analyze_peak',
    externalName: 'external_analyze_peak',
    description: 'Find peak amplitude',
    category: 'analyze',
  },
  {
    name: 'analyze_noiseFloor',
    externalName: 'external_analyze_noiseFloor',
    description: 'Measure noise floor',
    category: 'analyze',
  },
  {
    name: 'analyze_findResonances',
    externalName: 'external_analyze_findResonances',
    description: 'Find resonant frequencies',
    category: 'analyze',
  },
  // Plot tools
  {
    name: 'plot_spectrum',
    externalName: 'external_plot_spectrum',
    description: 'Plot frequency spectrum',
    category: 'plot',
  },
  {
    name: 'plot_waveform',
    externalName: 'external_plot_waveform',
    description: 'Plot time-domain waveform',
    category: 'plot',
  },
  {
    name: 'plot_comparison',
    externalName: 'external_plot_comparison',
    description: 'Before/after comparison',
    category: 'plot',
  },
]

// Category configuration
export interface CategoryConfig {
  name: string
  color: string
  dotColor: string
}

export const DEFAULT_CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  github: { name: 'GitHub', color: 'text-gray-400', dotColor: 'bg-gray-500' },
  npm: { name: 'NPM', color: 'text-gray-400', dotColor: 'bg-red-500' },
  utility: { name: 'Utility', color: 'text-gray-400', dotColor: 'bg-blue-500' },
}

export const AUDIO_CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  audio: { name: 'Audio I/O', color: 'text-gray-400', dotColor: 'bg-cyan-500' },
  dsp: { name: 'DSP', color: 'text-gray-400', dotColor: 'bg-purple-500' },
  analyze: {
    name: 'Analysis',
    color: 'text-gray-400',
    dotColor: 'bg-green-500',
  },
  plot: {
    name: 'Visualization',
    color: 'text-gray-400',
    dotColor: 'bg-amber-500',
  },
}

// LLM Tools Section Component
interface LLMToolsSectionProps {
  tools?: Array<LLMTool>
  llmToolCounts?: Map<string, number>
  llmCallCount?: number
  totalContextBytes?: number
  averageContextBytes?: number
  defaultOpen?: boolean
}

export function LLMToolsSection({
  tools = DEFAULT_LLM_TOOLS,
  llmToolCounts = new Map(),
  llmCallCount,
  totalContextBytes: _totalContextBytes,
  averageContextBytes: _averageContextBytes,
  defaultOpen = true,
}: LLMToolsSectionProps) {
  const totalLLMCalls =
    llmCallCount ??
    Array.from(llmToolCounts.values()).reduce((a, b) => a + b, 0)

  return (
    <CollapsibleSection
      title="LLM Tools"
      icon={<Terminal className="w-4 h-4" />}
      iconColorClass="text-cyan-400"
      titleColorClass="text-cyan-300"
      defaultOpen={defaultOpen}
      badge={
        totalLLMCalls > 0 ? (
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
            {totalLLMCalls}
          </span>
        ) : null
      }
    >
      <div className="space-y-2">
        {tools.map((tool) => {
          const count = llmToolCounts.get(tool.name) || 0
          return (
            <div
              key={tool.name}
              className="rounded-lg border border-cyan-500/30 bg-cyan-900/20 p-3"
            >
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-cyan-400" />
                <code className="text-sm font-mono text-cyan-300">
                  {tool.name}
                </code>
                {count > 0 && (
                  <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/30 text-cyan-200 font-medium">
                    {count}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-400">{tool.description}</p>
            </div>
          )
        })}
      </div>
    </CollapsibleSection>
  )
}

// Isolate VM Section Component
interface IsolateVMSectionProps {
  selectedVM: IsolateVM
  onVMChange: (vm: IsolateVM) => void
  options?: Array<IsolateVMOption>
  defaultOpen?: boolean
}

export function IsolateVMSection({
  selectedVM,
  onVMChange,
  options = DEFAULT_ISOLATE_VM_OPTIONS,
  defaultOpen = true,
}: IsolateVMSectionProps) {
  return (
    <CollapsibleSection
      title="Isolate VM"
      icon={<Cpu className="w-4 h-4" />}
      iconColorClass="text-purple-400"
      titleColorClass="text-purple-300"
      defaultOpen={defaultOpen}
    >
      <select
        value={selectedVM}
        onChange={(e) => onVMChange(e.target.value as IsolateVM)}
        className="w-full rounded-lg border border-purple-500/30 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={!option.available}
          >
            {option.name}
            {!option.available ? ' (coming soon)' : ''}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-gray-500">
        {options.find((o) => o.id === selectedVM)?.description}
      </p>
    </CollapsibleSection>
  )
}

// VM Tools Section Component
interface VMToolsSectionProps {
  tools?: Array<IsolateVMTool>
  toolInvocationCounts?: Map<string, number>
  categoryConfig?: Record<string, CategoryConfig>
  defaultOpen?: boolean
}

export function VMToolsSection({
  tools = DEFAULT_ISOLATE_VM_TOOLS,
  toolInvocationCounts = new Map(),
  categoryConfig = DEFAULT_CATEGORY_CONFIG,
  defaultOpen = true,
}: VMToolsSectionProps) {
  const totalVMCalls = Array.from(toolInvocationCounts.values()).reduce(
    (a, b) => a + b,
    0,
  )

  // Group tools by category
  const toolsByCategory = tools.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) {
        acc[tool.category] = []
      }
      acc[tool.category].push(tool)
      return acc
    },
    {} as Record<string, Array<IsolateVMTool>>,
  )

  return (
    <CollapsibleSection
      title="VM Tools"
      icon={<Wrench className="w-4 h-4" />}
      iconColorClass="text-amber-400"
      titleColorClass="text-amber-300"
      defaultOpen={defaultOpen}
      badge={
        totalVMCalls > 0 ? (
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
            {totalVMCalls}
          </span>
        ) : null
      }
    >
      {Object.entries(toolsByCategory).map(([category, categoryTools]) => {
        const config = categoryConfig[category] || {
          name: category,
          color: 'text-gray-400',
          dotColor: 'bg-gray-500',
        }

        return (
          <div key={category} className="mb-4 last:mb-0">
            <h4 className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
              {config.name}
            </h4>
            <div className="space-y-1.5">
              {categoryTools.map((tool) => {
                const count = toolInvocationCounts.get(tool.externalName) || 0
                return (
                  <div
                    key={tool.name}
                    className="group rounded border border-gray-700 bg-gray-800/50 px-2.5 py-1.5 hover:border-pink-500/40 hover:bg-pink-900/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-mono text-pink-400 group-hover:text-pink-300">
                        {tool.externalName}
                      </code>
                      {count > 0 && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-medium">
                          {count}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {tool.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </CollapsibleSection>
  )
}

// Main ToolSidebar Component
interface ToolSidebarProps {
  selectedVM: IsolateVM
  onVMChange: (vm: IsolateVM) => void
  toolInvocationCounts?: Map<string, number>
  llmToolCounts?: Map<string, number>
  llmCallCount?: number
  totalContextBytes?: number
  averageContextBytes?: number
  llmTools?: Array<LLMTool>
  vmTools?: Array<IsolateVMTool>
  vmOptions?: Array<IsolateVMOption>
  categoryConfig?: Record<string, CategoryConfig>
  llmToolsDefaultOpen?: boolean
  isolateVMDefaultOpen?: boolean
  vmToolsDefaultOpen?: boolean
  children?: React.ReactNode
  className?: string
}

export default function ToolSidebar({
  selectedVM,
  onVMChange,
  toolInvocationCounts = new Map(),
  llmToolCounts = new Map(),
  llmCallCount,
  totalContextBytes,
  averageContextBytes,
  llmTools = DEFAULT_LLM_TOOLS,
  vmTools = DEFAULT_ISOLATE_VM_TOOLS,
  vmOptions = DEFAULT_ISOLATE_VM_OPTIONS,
  categoryConfig = DEFAULT_CATEGORY_CONFIG,
  llmToolsDefaultOpen = true,
  isolateVMDefaultOpen = true,
  vmToolsDefaultOpen = true,
  children,
  className = '',
}: ToolSidebarProps) {
  return (
    <aside
      className={`w-96 border-r border-cyan-500/20 bg-gray-800/50 overflow-y-auto ${className}`}
    >
      <div className="p-4 space-y-6">
        {/* Custom sections (like audio files) go first */}
        {children}

        {/* LLM Tools Section */}
        <LLMToolsSection
          tools={llmTools}
          llmToolCounts={llmToolCounts}
          llmCallCount={llmCallCount}
          totalContextBytes={totalContextBytes}
          averageContextBytes={averageContextBytes}
          defaultOpen={llmToolsDefaultOpen}
        />

        {/* Isolate VM Selector */}
        <IsolateVMSection
          selectedVM={selectedVM}
          onVMChange={onVMChange}
          options={vmOptions}
          defaultOpen={isolateVMDefaultOpen}
        />

        {/* VM Tools Section */}
        <VMToolsSection
          tools={vmTools}
          toolInvocationCounts={toolInvocationCounts}
          categoryConfig={categoryConfig}
          defaultOpen={vmToolsDefaultOpen}
        />
      </div>
    </aside>
  )
}
