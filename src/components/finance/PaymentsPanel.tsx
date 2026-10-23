import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { listReceivables, listTripPayments } from '@/lib/finance.service';
import { listReservations } from '@/lib/reservations.service';
import { formatBRL, formatDay } from '@/lib/format';
import { financialStatusLabel, financialStatusVariant, paymentMethodLabel } from '@/lib/constants';
import type { FinancialStatus, Trip } from '@/types';
import { Search, Wallet } from 'lucide-react';
import { ReservationFinanceDialog } from './ReservationFinanceDialog';
import { ReceiptLink } from './Receipt';

const ORDER: FinancialStatus[] = ['ATRASADO', 'PENDENTE', 'PARCIALMENTE_PAGO', 'PAGO', 'CANCELADO', 'REEMBOLSADO'];

// Quem vê o financeiro (Admin, Financeiro) vê saldos e lançamentos. O
// Operador só registra pagamento passageiro a passageiro.
export function PaymentsPanel({ trip }: { trip: Trip }) {
  const { can } = useAuth();
  const full = can('finance.read');
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState('passageiros');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'TODOS' | FinancialStatus>('TODOS');

  const receivables = useQuery({ queryKey: ['receivables', trip.id], queryFn: () => listReceivables(trip.id), enabled: full });
  const ledger = useQuery({ queryKey: ['trip-payments', trip.id], queryFn: () => listTripPayments(trip.id), enabled: full && view === 'lancamentos' });
  const reservations = useQuery({ queryKey: ['reservations', trip.id], queryFn: () => listReservations(trip.id), enabled: !full });

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (receivables.data ?? [])
        .filter((r) => (status === 'TODOS' ? true : r.status === status) && (!term || r.passenger_name.toLowerCase().includes(term)))
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.passenger_name.localeCompare(b.passenger_name)),
    [receivables.data, status, term],
  );

  const totals = useMemo(() => {
    const active = (receivables.data ?? []).filter((r) => r.status !== 'CANCELADO' && r.status !== 'REEMBOLSADO' && r.reservation_status !== 'LISTA_ESPERA');
    return {
      received: active.reduce((n, r) => n + r.paid, 0),
      pending: active.reduce((n, r) => n + Math.max(0, r.balance), 0),
      overdue: active.reduce((n, r) => n + r.overdue_amount, 0),
      late: active.filter((r) => r.status === 'ATRASADO').length,
    };
  }, [receivables.data]);

  if (!full) {
    const list = (reservations.data ?? []).filter((r) => !['CANCELADA', 'REEMBOLSADA', 'LISTA_ESPERA'].includes(r.reservation_status) && (!term || r.passenger_name.toLowerCase().includes(term)));
    return (
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar passageiro" aria-label="Buscar passageiro" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {reservations.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {list.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{r.passenger_name}</span>
                  {r.final_price !== null && <span className="text-muted-foreground"> · {r.is_courtesy ? 'cortesia' : formatBRL(r.final_price)}</span>}
                </span>
                <Button size="sm" variant="outline" onClick={() => setOpen(r.id)}>
                  <Wallet className="h-4 w-4" /> Pagamentos
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ReservationFinanceDialog reservationId={open} tripId={trip.id} onClose={() => setOpen(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          ['Recebido', formatBRL(totals.received), 'text-success'],
          ['A receber', formatBRL(totals.pending), 'text-warning'],
          ['Vencido', formatBRL(totals.overdue), totals.overdue ? 'text-destructive' : ''],
          ['Passageiros atrasados', String(totals.late), totals.late ? 'text-destructive' : ''],
        ].map(([label, value, tone]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="passageiros">Por passageiro</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === 'passageiros' && (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar passageiro" aria-label="Buscar passageiro" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por situação">
              {(['TODOS', 'ATRASADO', 'PENDENTE', 'PARCIALMENTE_PAGO', 'PAGO'] as const).map((s) => (
                <Button key={s} size="sm" variant={status === s ? 'secondary' : 'ghost'} onClick={() => setStatus(s)} aria-pressed={status === s}>
                  {s === 'TODOS' ? 'Todos' : financialStatusLabel[s]}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      {view === 'passageiros' ? (
        receivables.isLoading ? (
          <Skeleton className="h-48" />
        ) : rows.length === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-xl text-sm text-muted-foreground">Nenhum passageiro nessa situação.</div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passageiro</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Próx. vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.reservation_id} className="cursor-pointer" onClick={() => setOpen(r.reservation_id)}>
                    <TableCell>
                      <button type="button" className="font-medium hover:text-primary text-left" onClick={() => setOpen(r.reservation_id)}>
                        {r.passenger_name}
                      </button>
                      {r.installments_count > 0 && <p className="text-xs text-muted-foreground">{r.installments_count} parcela(s)</p>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{r.is_courtesy ? 'Cortesia' : formatBRL(r.final_price)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatBRL(r.paid)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">{formatBRL(r.balance)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.next_due_date ? formatDay(r.next_due_date) : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={financialStatusVariant[r.status]}>{financialStatusLabel[r.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : ledger.isLoading ? (
        <Skeleton className="h-48" />
      ) : (ledger.data ?? []).length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-xl text-sm text-muted-foreground">Nenhum lançamento ainda.</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Passageiro</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Lançado por</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.data!.map((p) => (
                <TableRow key={p.id} className={p.status === 'ESTORNADO' ? 'text-muted-foreground' : undefined}>
                  <TableCell className="whitespace-nowrap">{formatDay(p.payment_date)}</TableCell>
                  <TableCell>
                    <button type="button" className="hover:text-primary text-left" onClick={() => setOpen(p.reservation_id)}>
                      {p.passenger_name}
                    </button>
                    {p.status === 'ESTORNADO' && <p className="text-xs">Estornado: {p.reversal_reason}</p>}
                  </TableCell>
                  <TableCell className={`text-right whitespace-nowrap ${p.status === 'ESTORNADO' ? 'line-through' : ''}`}>
                    {p.kind === 'REEMBOLSO' ? '− ' : ''}
                    {formatBRL(p.amount)}
                  </TableCell>
                  <TableCell>{paymentMethodLabel[p.payment_method]}{p.kind === 'REEMBOLSO' && ' (reembolso)'}</TableCell>
                  <TableCell className="text-sm">{p.created_by_name ?? '—'}</TableCell>
                  <TableCell>{p.receipt && <ReceiptLink file={p.receipt} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ReservationFinanceDialog reservationId={open} tripId={trip.id} onClose={() => setOpen(null)} />
    </div>
  );
}
