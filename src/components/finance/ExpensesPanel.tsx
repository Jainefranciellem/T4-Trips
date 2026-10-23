import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api';
import { cancelExpense, listExpenses, payExpense, reverseExpensePayment, type PaymentInput } from '@/lib/finance.service';
import { formatBRL, formatDay } from '@/lib/format';
import { expenseStatusLabel, expenseStatusVariant, paymentMethodLabel } from '@/lib/constants';
import type { Trip, TripExpense } from '@/types';
import { Ban, Pencil, Plus, Undo2 } from 'lucide-react';
import { ExpenseFormDialog } from './ExpenseFormDialog';
import { PaymentForm } from './PaymentForm';
import { ReasonDialog } from './ReasonDialog';
import { ReceiptLink } from './Receipt';

export function ExpensesPanel({ trip }: { trip: Trip }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = can('expenses.write') && !['ARQUIVADA'].includes(trip.status);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TripExpense | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<TripExpense | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);
  const [overpay, setOverpay] = useState<{ payload: PaymentInput; message: string } | null>(null);

  const query = useQuery({ queryKey: ['expenses', trip.id], queryFn: () => listExpenses(trip.id) });
  const detail = query.data?.find((e) => e.id === detailId) ?? null;

  const refresh = (updated: TripExpense) => {
    queryClient.setQueryData<TripExpense[]>(['expenses', trip.id], (list) => list?.map((e) => (e.id === updated.id ? updated : e)));
    queryClient.invalidateQueries({ queryKey: ['finance-dashboard', trip.id] });
  };
  const fail = (err: Error) => toast({ title: 'Não foi possível concluir', description: err.message, variant: 'destructive' });

  const pay = useMutation({
    mutationFn: (payload: PaymentInput) => payExpense(detailId!, payload),
    onSuccess: (e) => {
      setOverpay(null);
      refresh(e);
      toast({ title: 'Pagamento registrado' });
    },
    onError: (err: Error, payload) => {
      if (err instanceof ApiError && err.body?.code === 'OVERPAYMENT') return setOverpay({ payload, message: err.message });
      fail(err);
    },
  });
  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reverseExpensePayment(id, reason),
    onSuccess: (e) => {
      setReversing(null);
      refresh(e);
      toast({ title: 'Pagamento estornado' });
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelExpense(id, reason),
    onSuccess: (e) => {
      setCancelling(null);
      refresh(e);
      toast({ title: 'Despesa cancelada' });
    },
    onError: fail,
  });

  const totals = useMemo(() => {
    const live = (query.data ?? []).filter((e) => !e.cancelled_at);
    return {
      planned: live.reduce((n, e) => n + e.planned_amount, 0),
      paid: (query.data ?? []).reduce((n, e) => n + e.paid, 0),
      pending: live.reduce((n, e) => n + Math.max(0, e.balance), 0),
      overdue: live.filter((e) => e.status === 'VENCIDA').length,
    };
  }, [query.data]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          ['Previstas', formatBRL(totals.planned), ''],
          ['Pagas', formatBRL(totals.paid), 'text-success'],
          ['A pagar', formatBRL(totals.pending), 'text-warning'],
          ['Vencidas', String(totals.overdue), totals.overdue ? 'text-destructive' : ''],
        ].map(([label, value, tone]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {canWrite && (
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nova despesa
        </Button>
      )}

      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : (query.data ?? []).length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-xl text-sm text-muted-foreground">Nenhuma despesa lançada.</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Despesa</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.map((e) => (
                <TableRow key={e.id} className={e.cancelled_at ? 'text-muted-foreground' : undefined}>
                  <TableCell>
                    <button type="button" className="font-medium hover:text-primary text-left" onClick={() => setDetailId(e.id)}>
                      {e.description}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {e.category.name}
                      {e.supplier_name && ` · ${e.supplier_name}`}
                      {e.cost_type === 'POR_PESSOA' && ' · por passageiro'}
                    </p>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatBRL(e.planned_amount)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatBRL(e.paid)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">{e.cancelled_at ? '—' : formatBRL(e.balance)}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.due_date ? formatDay(e.due_date) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={expenseStatusVariant[e.status]}>{expenseStatusLabel[e.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {detail && (
        <Dialog open onOpenChange={(o) => !o && setDetailId(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{detail.description}</DialogTitle>
              <DialogDescription>
                {detail.category.name}
                {detail.supplier_name && ` · ${detail.supplier_name}`}
                {detail.due_date && ` · vence ${formatDay(detail.due_date)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Previsto</p>
                  <p className="font-semibold">{formatBRL(detail.planned_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pago</p>
                  <p className="font-semibold text-success">{formatBRL(detail.paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="font-semibold">{formatBRL(detail.balance)}</p>
                </div>
              </div>
              {detail.cancelled_at && <p className="text-sm text-muted-foreground">Cancelada: {detail.cancel_reason}</p>}
              {detail.notes && <p className="text-sm whitespace-pre-line">{detail.notes}</p>}
              {detail.receipt && (
                <p className="text-sm flex items-center gap-1">
                  Documento da despesa <ReceiptLink file={detail.receipt} />
                </p>
              )}

              {canWrite && !detail.cancelled_at && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(detail);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setCancelling(detail)}>
                    <Ban className="h-4 w-4" /> Cancelar despesa
                  </Button>
                </div>
              )}

              {canWrite && !detail.cancelled_at && detail.balance > 0 && (
                <section className="space-y-2">
                  <h3 className="font-semibold text-sm">Registrar pagamento</h3>
                  <PaymentForm key={`${detail.payments.length}-${detail.paid}`} suggestedAmount={detail.balance} submitLabel="Registrar pagamento" busy={pay.isPending} onSubmit={(v) => pay.mutate(v)} />
                </section>
              )}

              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Pagamentos</h3>
                {detail.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {detail.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className={p.status === 'ESTORNADO' ? 'text-muted-foreground' : undefined}>
                          <p>
                            <span className={p.status === 'ESTORNADO' ? 'line-through' : 'font-medium'}>{formatBRL(p.amount)}</span> ·{' '}
                            {paymentMethodLabel[p.payment_method]} · {formatDay(p.payment_date)}
                          </p>
                          {p.status === 'ESTORNADO' && <p className="text-xs">Estornado: {p.reversal_reason}</p>}
                        </div>
                        <div className="flex shrink-0">
                          {p.receipt && <ReceiptLink file={p.receipt} />}
                          {p.status === 'VALIDO' && can('finance.reverse') && (
                            <Button variant="ghost" size="icon-sm" aria-label="Estornar pagamento" onClick={() => setReversing(p.id)}>
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <ReasonDialog
              open={!!reversing}
              title="Estornar pagamento?"
              description="O lançamento continua no histórico e o saldo da despesa volta a subir."
              confirmLabel="Estornar"
              busy={reverse.isPending}
              onCancel={() => setReversing(null)}
              onConfirm={(reason) => reverse.mutate({ id: reversing!, reason })}
            />
            <AlertDialog open={!!overpay} onOpenChange={(o) => !o && setOverpay(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Valor acima do previsto</AlertDialogTitle>
                  <AlertDialogDescription>{overpay?.message}. Registrar mesmo assim?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => pay.mutate({ ...overpay!.payload, confirm_overpayment: true })}>Registrar assim</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogContent>
        </Dialog>
      )}

      <ReasonDialog
        open={!!cancelling}
        title={`Cancelar “${cancelling?.description}”?`}
        description="A despesa sai do previsto, mas continua no histórico com os pagamentos já feitos."
        confirmLabel="Cancelar despesa"
        busy={cancel.isPending}
        onCancel={() => setCancelling(null)}
        onConfirm={(reason) => cancel.mutate({ id: cancelling!.id, reason })}
      />
      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} tripId={trip.id} expense={editing} />
    </div>
  );
}
