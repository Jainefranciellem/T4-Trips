import { useEffect, useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api';
import { getReservationFinance, registerPayment, registerRefund, reversePayment, savePaymentPlan, type PaymentInput } from '@/lib/finance.service';
import { splitInstallments } from '@/lib/installments';
import { centsToInput, formatBRL, formatDay, parseBRLToCents, todayISO } from '@/lib/format';
import { financialStatusLabel, financialStatusVariant, installmentStatusLabel, installmentStatusVariant, paymentMethodLabel } from '@/lib/constants';
import type { ReservationFinance } from '@/types';
import { AlertTriangle, CalendarRange, Loader2, Undo2 } from 'lucide-react';
import { PaymentForm } from './PaymentForm';
import { ReceiptLink } from './Receipt';
import { ReasonDialog } from './ReasonDialog';

interface Props {
  reservationId: string | null;
  tripId: string;
  onClose: () => void;
}

const ENDED = ['CANCELADA', 'REEMBOLSADA'];

function PlanEditor({ finance, busy, onSave }: { finance: ReservationFinance; busy: boolean; onSave: (rows: { due_date: string; amount: number }[]) => void }) {
  const [count, setCount] = useState(String(Math.max(1, finance.installments.length || 3)));
  const [first, setFirst] = useState(finance.installments[0]?.due_date ?? todayISO());
  const [rows, setRows] = useState<{ due_date: string; amount: string }[]>([]);

  const generate = () => {
    const n = Math.min(24, Math.max(1, Number(count) || 1));
    setRows(splitInstallments(finance.final_price, n, first).map((r) => ({ due_date: r.due_date, amount: centsToInput(r.amount) })));
  };
  useEffect(generate, [finance.final_price]); // eslint-disable-line react-hooks/exhaustive-deps

  const cents = rows.map((r) => parseBRLToCents(r.amount));
  const total = cents.reduce<number>((n, c) => n + (c ?? 0), 0);
  const valid = rows.length > 0 && cents.every((c) => c && c > 0) && total === finance.final_price && rows.every((r) => r.due_date);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="plan-count" className="text-xs">Parcelas</Label>
          <Input id="plan-count" type="number" min={1} max={24} className="w-20" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-first" className="text-xs">1º vencimento</Label>
          <Input id="plan-first" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={generate}>
          Dividir
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">{i + 1}ª</span>
            <Input type="date" aria-label={`Vencimento da parcela ${i + 1}`} value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
            <Input inputMode="decimal" aria-label={`Valor da parcela ${i + 1}`} value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <p className={`text-sm ${total === finance.final_price ? 'text-muted-foreground' : 'text-destructive'}`}>
        Soma {formatBRL(total)} de {formatBRL(finance.final_price)}
      </p>
      <Button size="sm" disabled={!valid || busy} onClick={() => onSave(rows.map((r, i) => ({ due_date: r.due_date, amount: cents[i]! })))}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar parcelamento
      </Button>
    </div>
  );
}

// RF-019 / fluxo 13.3: tudo que é financeiro de uma reserva num lugar só.
export function ReservationFinanceDialog({ reservationId, tripId, onClose }: Props) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [overpay, setOverpay] = useState<{ payload: PaymentInput; message: string } | null>(null);

  const query = useQuery({
    queryKey: ['reservation-finance', reservationId],
    queryFn: () => getReservationFinance(reservationId!),
    enabled: !!reservationId,
  });
  useEffect(() => {
    setEditingPlan(false);
    setOverpay(null);
  }, [reservationId]);

  const done = (data: ReservationFinance, title: string) => {
    queryClient.setQueryData(['reservation-finance', reservationId], data);
    for (const key of [['receivables', tripId], ['trip-payments', tripId], ['finance-dashboard', tripId], ['trip', tripId], ['trips']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    toast({ title });
  };
  const fail = (err: Error) => toast({ title: 'Não foi possível concluir', description: err.message, variant: 'destructive' });

  const pay = useMutation({
    mutationFn: (payload: PaymentInput) => registerPayment(reservationId!, payload),
    onSuccess: (d) => {
      setOverpay(null);
      done(d, 'Pagamento registrado');
    },
    onError: (err: Error, payload) => {
      if (err instanceof ApiError && err.body?.code === 'OVERPAYMENT') return setOverpay({ payload, message: err.message });
      fail(err);
    },
  });
  const plan = useMutation({
    mutationFn: (rows: { due_date: string; amount: number }[]) => savePaymentPlan(reservationId!, rows),
    onSuccess: (d) => {
      setEditingPlan(false);
      done(d, 'Parcelamento salvo');
    },
    onError: fail,
  });
  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reversePayment(id, reason),
    onSuccess: (d) => {
      setReversing(null);
      done(d, 'Lançamento estornado');
    },
    onError: fail,
  });
  const refund = useMutation({
    mutationFn: (payload: Parameters<typeof registerRefund>[1]) => registerRefund(reservationId!, payload),
    onSuccess: (d) => done(d, 'Reembolso registrado'),
    onError: fail,
  });

  if (!reservationId) return null;
  const f = query.data;
  const ended = f && ENDED.includes(f.reservation_status);
  const nextInstallment = f?.installments.find((i) => i.status !== 'PAGA');
  const suggested = f ? Math.max(0, Math.min(f.balance, nextInstallment ? nextInstallment.amount - nextInstallment.paid_amount : f.balance)) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamentos · {f?.passenger_name ?? '…'}</DialogTitle>
        </DialogHeader>

        {query.isLoading || !f ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Contratado</p>
                <p className="font-semibold">{f.is_courtesy ? 'Cortesia' : formatBRL(f.final_price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pago</p>
                <p className="font-semibold text-success">{formatBRL(f.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{f.balance < 0 ? 'Pago a mais' : 'Saldo'}</p>
                <p className="font-semibold">{formatBRL(Math.abs(f.balance))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Situação</p>
                <Badge variant={financialStatusVariant[f.status]}>{financialStatusLabel[f.status]}</Badge>
              </div>
            </div>
            {f.refunded > 0 && <p className="text-sm text-muted-foreground">Reembolsado: {formatBRL(f.refunded)}</p>}

            {/* Parcelas */}
            {!ended && f.final_price > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Parcelas</h3>
                  {can('finance.write') && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingPlan(!editingPlan)}>
                      <CalendarRange className="h-4 w-4" /> {f.installments.length ? 'Refazer parcelamento' : 'Parcelar'}
                    </Button>
                  )}
                </div>
                {f.plan_mismatch && (
                  <p className="text-sm text-warning flex items-center gap-2" role="alert">
                    <AlertTriangle className="h-4 w-4" /> O valor contratado mudou: refaça o parcelamento.
                  </p>
                )}
                {editingPlan ? (
                  <PlanEditor finance={f} busy={plan.isPending} onSave={(rows) => plan.mutate(rows)} />
                ) : f.installments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem parcelamento{f.payment_due_date ? `. Prazo de pagamento: ${formatDay(f.payment_due_date)}` : ''}.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {f.installments.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>{i.installment_number}ª</TableCell>
                          <TableCell>{formatDay(i.due_date)}</TableCell>
                          <TableCell className="text-right">{formatBRL(i.amount)}</TableCell>
                          <TableCell className="text-right">{formatBRL(i.paid_amount)}</TableCell>
                          <TableCell>
                            <Badge variant={installmentStatusVariant[i.status]}>{installmentStatusLabel[i.status]}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            )}

            {/* Novo pagamento / reembolso */}
            {!ended && can('finance.write') && f.final_price > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Registrar pagamento</h3>
                <PaymentForm key={`${f.payments.length}-${f.paid}`} suggestedAmount={suggested} submitLabel="Registrar pagamento" busy={pay.isPending} onSubmit={(v) => pay.mutate(v)} />
              </section>
            )}
            {ended && can('finance.reverse') && f.paid > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Registrar reembolso</h3>
                <p className="text-sm text-muted-foreground">Reserva cancelada. Até {formatBRL(f.paid)} pode ser devolvido.</p>
                <PaymentForm
                  key={`${f.payments.length}-${f.paid}`}
                  suggestedAmount={f.paid}
                  submitLabel="Registrar reembolso"
                  busy={refund.isPending}
                  withReceipt={false}
                  withReason
                  onSubmit={(v) => refund.mutate({ amount: v.amount, payment_date: v.payment_date, payment_method: v.payment_method, reference: v.reference, reason: v.reason! })}
                />
              </section>
            )}

            {/* Histórico */}
            <section className="space-y-2">
              <h3 className="font-semibold text-sm">Lançamentos</h3>
              {f.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {f.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className={p.status === 'ESTORNADO' ? 'text-muted-foreground' : undefined}>
                        <p>
                          <span className={p.status === 'ESTORNADO' ? 'line-through' : 'font-medium'}>
                            {p.kind === 'REEMBOLSO' ? '− ' : ''}
                            {formatBRL(p.amount)}
                          </span>{' '}
                          · {paymentMethodLabel[p.payment_method]} · {formatDay(p.payment_date)}
                          {p.kind === 'REEMBOLSO' && ' · reembolso'}
                        </p>
                        {p.reference && <p className="text-xs text-muted-foreground">{p.reference}</p>}
                        {p.status === 'ESTORNADO' && <p className="text-xs">Estornado: {p.reversal_reason}</p>}
                      </div>
                      <div className="flex shrink-0">
                        {p.receipt && <ReceiptLink file={p.receipt} />}
                        {p.status === 'VALIDO' && can('finance.reverse') && (
                          <Button variant="ghost" size="icon-sm" aria-label="Estornar lançamento" onClick={() => setReversing(p.id)}>
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
        )}

        <ReasonDialog
          open={!!reversing}
          title="Estornar lançamento?"
          description="O lançamento continua no histórico, mas deixa de contar no valor recebido."
          confirmLabel="Estornar"
          busy={reverse.isPending}
          onCancel={() => setReversing(null)}
          onConfirm={(reason) => reverse.mutate({ id: reversing!, reason })}
        />
        <AlertDialog open={!!overpay} onOpenChange={(o) => !o && setOverpay(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Valor acima do contratado</AlertDialogTitle>
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
  );
}
