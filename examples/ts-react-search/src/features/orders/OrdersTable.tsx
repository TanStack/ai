import type { Order } from './types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import formatDate from '@/utils/formatDate'

type OrdersTableProps = {
  orders: Array<Order>
}

function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Order ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Payment method</TableHead>
          <TableHead>From</TableHead>
          <TableHead className="pr-6">To</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-muted-foreground"
            >
              No orders match the selected filters.
            </TableCell>
          </TableRow>
        ) : (
          orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-sm pl-6">
                {order.id}
              </TableCell>
              <TableCell>{order.status}</TableCell>
              <TableCell>{order.paymentMethod}</TableCell>
              <TableCell>{formatDate(order.from)}</TableCell>
              <TableCell className="w-0 pr-6">{formatDate(order.to)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export default OrdersTable
