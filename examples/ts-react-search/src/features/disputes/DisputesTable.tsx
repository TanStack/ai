import type { Dispute } from './types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import formatDate from '@/utils/formatDate'

type DisputesTableProps = {
  disputes: Array<Dispute>
}

function DisputesTable({ disputes }: DisputesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Dispute ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>From</TableHead>
          <TableHead className="pr-6">To</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {disputes.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-muted-foreground"
            >
              No disputes match the selected filters.
            </TableCell>
          </TableRow>
        ) : (
          disputes.map((dispute) => (
            <TableRow key={dispute.id}>
              <TableCell className="font-mono text-sm pl-6">
                {dispute.id}
              </TableCell>
              <TableCell>{dispute.status}</TableCell>
              <TableCell>{dispute.reason}</TableCell>
              <TableCell>{formatDate(dispute.from)}</TableCell>
              <TableCell className="w-0 pr-6">
                {formatDate(dispute.to)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export default DisputesTable
