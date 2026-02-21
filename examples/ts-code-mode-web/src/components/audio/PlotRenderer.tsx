import { SpectrumPlot } from './SpectrumPlot'
import { WaveformPlot } from './WaveformPlot'
import { ComparisonPlot } from './ComparisonPlot'
import { DataTable } from './DataTable'

export interface PlotData {
  plotId: string
  type: 'spectrum' | 'waveform' | 'spectrogram' | 'line' | 'bar' | 'comparison' | 'table'
  data: unknown
}

interface PlotRendererProps {
  plot: PlotData
}

export function PlotRenderer({ plot }: PlotRendererProps) {
  switch (plot.type) {
    case 'spectrum': {
      const d = plot.data as {
        frequencies: number[]
        magnitudes: number[]
        title?: string
        xMin?: number
        xMax?: number
        yMin?: number
        yMax?: number
        highlights?: Array<{ frequency?: number; x?: number; label?: string; color?: string }>
      }
      return (
        <SpectrumPlot
          frequencies={d.frequencies}
          magnitudes={d.magnitudes}
          title={d.title}
          xMin={d.xMin}
          xMax={d.xMax}
          yMin={d.yMin}
          yMax={d.yMax}
          highlights={d.highlights}
        />
      )
    }
    
    case 'waveform': {
      const d = plot.data as {
        samples: number[]
        sampleRate: number
        title?: string
        startTime?: number
        endTime?: number
      }
      return (
        <WaveformPlot
          samples={d.samples}
          sampleRate={d.sampleRate}
          title={d.title}
          startTime={d.startTime}
          endTime={d.endTime}
        />
      )
    }
    
    case 'comparison': {
      const d = plot.data as {
        series: Array<{
          label: string
          frequencies: number[]
          magnitudes: number[]
          color?: string
        }>
        title?: string
        xMin?: number
        xMax?: number
      }
      return (
        <ComparisonPlot
          series={d.series}
          title={d.title}
          xMin={d.xMin}
          xMax={d.xMax}
        />
      )
    }
    
    case 'table': {
      const d = plot.data as {
        data: Array<Record<string, unknown>>
        title?: string
        columns?: Array<{ key: string; label?: string }>
      }
      return (
        <DataTable
          data={d.data}
          title={d.title}
          columns={d.columns}
        />
      )
    }
    
    case 'spectrogram': {
      // Simple heatmap representation
      const d = plot.data as {
        spectrogram: number[][]
        times: number[]
        frequencies: number[]
        title?: string
      }
      return (
        <div className="bg-gray-900/50 rounded-lg border border-cyan-500/20 p-4">
          <h3 className="text-sm font-medium text-cyan-300 mb-4">{d.title || 'Spectrogram'}</h3>
          <div className="h-48 flex items-center justify-center text-gray-500">
            <p>Spectrogram visualization ({d.spectrogram.length} frames x {d.frequencies.length} bins)</p>
          </div>
        </div>
      )
    }
    
    case 'line':
    case 'bar': {
      const d = plot.data as {
        data: Array<{ x?: number; y?: number; label?: string; value?: number }>
        title?: string
      }
      return (
        <DataTable
          data={d.data}
          title={d.title}
        />
      )
    }
    
    default:
      return (
        <div className="bg-gray-900/50 rounded-lg border border-red-500/20 p-4">
          <p className="text-red-400 text-sm">Unknown plot type: {plot.type}</p>
        </div>
      )
  }
}

