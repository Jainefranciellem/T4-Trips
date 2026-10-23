import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getFinanceDashboard } from '@/lib/finance.service';
import { formatBRL, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Trip } from '@/types';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

function Tile({ label, value, hint, negative }: { label: string; value: ReactNode; hint?: ReactNode; negative?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1 tabular-nums flex items-center gap-1.5">
          {negative !== undefined &&
            (negative ? <TrendingDown className="h-4 w-4 text-destructive" aria-label="negativo" /> : <TrendingUp className="h-4 w-4 text-success" aria-label="positivo" />)}
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// RF-020: números da viagem calculados pelo RN-010 no servidor.
export function FinanceDashboardPanel({ trip }: { trip: Trip }) {
  const { data: d, isLoading, isError, error } = useQuery({ queryKey: ['finance-dashboard', trip.id], queryFn: () => getFinanceDashboard(trip.id) });

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (isError || !d) return <p className="text-destructive">{(error as Error)?.message}</p>;

  const breakEvenHint =
    d.break_even_passengers === null
      ? 'Precisa de passageiros pagantes e despesas lançadas'
      : d.paying_passengers >= d.break_even_passengers
        ? `Já tem ${d.paying_passengers} pagantes`
        : `Faltam ${d.break_even_passengers - d.paying_passengers} pagante(s)`;

  return (
    <div className="space-y-6">
      {(d.overdue_amount > 0 || d.expenses_overdue > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" role="alert">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <span>
            {d.overdue_amount > 0 && <>{formatBRL(d.overdue_amount)} em parcelas vencidas de {d.reservations_by_status.atrasado} passageiro(s). </>}
            {d.expenses_overdue > 0 && <>{d.expenses_overdue} despesa(s) vencida(s).</>}
          </span>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Receitas</h3>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Tile label="Receita prevista" value={formatBRL(d.revenue_expected)} hint="Contratos ativos" />
          <Tile label="Receita recebida" value={formatBRL(d.revenue_received)} />
          <Tile label="A receber" value={formatBRL(d.revenue_pending)} />
          <Tile label="Ticket médio" value={d.average_ticket === null ? '—' : formatBRL(d.average_ticket)} hint={`${d.paying_passengers} pagante(s) · ${d.courtesy_passengers} cortesia(s)`} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Despesas</h3>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Tile label="Despesas previstas" value={formatBRL(d.expenses_expected)} />
          <Tile label="Despesas pagas" value={formatBRL(d.expenses_paid)} />
          <Tile label="Despesas a pagar" value={formatBRL(d.expenses_pending)} />
          <Tile label="Custo por passageiro" value={formatBRL(d.variable_per_passenger)} hint={`Custos fixos: ${formatBRL(d.fixed_costs)}`} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Resultado</h3>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Tile label="Lucro previsto" value={formatBRL(d.profit_expected)} negative={d.profit_expected < 0} hint={`Margem prevista ${formatPercent(d.margin_expected)}`} />
          <Tile label="Resultado realizado" value={formatBRL(d.result_realized)} negative={d.result_realized < 0} hint={`Margem realizada ${formatPercent(d.margin_realized)}`} />
          <Tile
            label="Ponto de equilíbrio"
            value={d.break_even_passengers === null ? '—' : `${d.break_even_passengers} pagantes`}
            hint={breakEvenHint}
          />
          <Tile label="Retido de cancelamentos" value={formatBRL(d.retained_from_cancellations)} hint="Pago por quem cancelou e não foi devolvido" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {d.by_category.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa lançada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Previsto</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="w-32 hidden sm:table-cell">Quitado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.by_category.map((c) => {
                    const pct = c.planned ? Math.min(100, Math.round((c.paid / c.planned) * 100)) : 0;
                    return (
                      <TableRow key={c.category}>
                        <TableCell>{c.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(c.planned)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(c.paid)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.category} quitado`}>
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Passageiros por situação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ['Pagos', d.reservations_by_status.pago],
                ['Parcialmente pagos', d.reservations_by_status.parcial],
                ['Pendentes', d.reservations_by_status.pendente],
                ['Atrasados', d.reservations_by_status.atrasado],
              ].map(([label, n]) => (
                <div key={label as string} className={cn('flex justify-between', label === 'Atrasados' && Number(n) > 0 && 'font-medium text-destructive')}>
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
