import type { Settlement } from './types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import formatDate from '@/utils/formatDate'

type SettlementsTableProps = {
  settlements: Array<Settlement>
}

function SettlementsTable({ settlements }: SettlementsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Settlement ID</TableHead>
          <TableHead>Currency</TableHead>
          <TableHead>From</TableHead>
          <TableHead className="pr-6">To</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {settlements.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={4}
              className="text-center text-muted-foreground"
            >
              No settlements match the selected filters.
            </TableCell>
          </TableRow>
        ) : (
          settlements.map((settlement) => (
            <TableRow key={settlement.id}>
              <TableCell className="font-mono text-sm pl-6">
                {settlement.id}
              </TableCell>
              <TableCell>{settlement.currency}</TableCell>
              <TableCell>{formatDate(settlement.from)}</TableCell>
              <TableCell className="w-0 pr-6">
                {formatDate(settlement.to)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export default SettlementsTable
