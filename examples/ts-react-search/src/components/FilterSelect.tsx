import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ALL_OPTION } from '@/constants'

type FilterSelectProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: FilterSelectProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select name="status" value={value || ''} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>All</SelectItem>
          {options.map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default FilterSelect
