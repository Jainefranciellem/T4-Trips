import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { applyScenario, createScenario, deleteScenario, getPricingDefaults, listScenarios, updateScenario } from '@/lib/planning.service';
import { calculatePricing, compareByPassengers, pricingProblem } from '@/lib/pricing';
import { centsToInput, formatBRL, formatPercent, parseBRLToCents } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PricingScenario, PricingScenarioInput } from '@/types';
import { AlertTriangle, Copy, Download, Loader2, Plus, Save, Tag, Trash2 } from 'lucide-react';

const blank: PricingScenarioInput = {
  name: 'Novo cenário',
  paying_passengers: 20,
  courtesy_passengers: 0,
  vehicle_capacity: null,
  fixed_costs: 0,
  variable_cost_per_person: 0,
  discounts: 0,
  installment_fee_bp: 0,
  contingency_type: 'PERCENTUAL',
  contingency_value: 0,
  desired_margin_bp: 2000,
  desired_price: null,
};

// Campos de texto do formulário: dinheiro em "1.287,00", percentual em "15".
interface Form {
  name: string;
  paying_passengers: string;
  courtesy_passengers: string;
  vehicle_capacity: string;
  fixed_costs: string;
  variable_cost_per_person: string;
  discounts: string;
  installment_fee: string;
  contingency_type: 'FIXO' | 'PERCENTUAL';
  contingency_value: string;
  desired_margin: string;
  desired_price: string;
}

const pct = (bp: number) => (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const toForm = (s: PricingScenarioInput): Form => ({
  name: s.name,
  paying_passengers: String(s.paying_passengers),
  courtesy_passengers: String(s.courtesy_passengers),
  vehicle_capacity: s.vehicle_capacity ? String(s.vehicle_capacity) : '',
  fixed_costs: centsToInput(s.fixed_costs),
  variable_cost_per_person: centsToInput(s.variable_cost_per_person),
  discounts: s.discounts ? centsToInput(s.discounts) : '',
  installment_fee: s.installment_fee_bp ? pct(s.installment_fee_bp) : '',
  contingency_type: s.contingency_type,
  contingency_value: s.contingency_type === 'FIXO' ? (s.contingency_value ? centsToInput(s.contingency_value) : '') : s.contingency_value ? pct(s.contingency_value) : '',
  desired_margin: pct(s.desired_margin_bp),
  desired_price: s.desired_price ? centsToInput(s.desired_price) : '',
});

const money = (v: string) => (v.trim() ? parseBRLToCents(v) : 0);
const percentBp = (v: string) => {
  if (!v.trim()) return 0;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const int = (v: string, min: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min ? n : null;
};

function fromForm(f: Form): PricingScenarioInput | string {
  const paying = int(f.paying_passengers, 1);
  const courtesy = f.courtesy_passengers.trim() ? int(f.courtesy_passengers, 0) : 0;
  const capacity = f.vehicle_capacity.trim() ? int(f.vehicle_capacity, 1) : null;
  const fixed = money(f.fixed_costs);
  const variable = money(f.variable_cost_per_person);
  const discounts = money(f.discounts);
  const fee = percentBp(f.installment_fee);
  const margin = percentBp(f.desired_margin);
  const contingency = f.contingency_type === 'FIXO' ? money(f.contingency_value) : percentBp(f.contingency_value);
  const price = f.desired_price.trim() ? parseBRLToCents(f.desired_price) : null;
  if (paying === null) return 'Informe ao menos um passageiro pagante.';
  if (courtesy === null || (f.vehicle_capacity.trim() && capacity === null)) return 'Quantidade inválida.';
  if ([fixed, variable, discounts, fee, margin, contingency].some((v) => v === null)) return 'Há um valor inválido.';
  if (f.desired_price.trim() && !price) return 'Preço desejado inválido.';
  const input: PricingScenarioInput = {
    name: f.name.trim() || 'Cenário',
    paying_passengers: paying,
    courtesy_passengers: courtesy,
    vehicle_capacity: capacity,
    fixed_costs: fixed!,
    variable_cost_per_person: variable!,
    discounts: discounts!,
    installment_fee_bp: fee!,
    contingency_type: f.contingency_type,
    contingency_value: contingency!,
    desired_margin_bp: margin!,
    desired_price: price,
  };
  return pricingProblem(input) ?? input;
}

function Out({ label, value, strong, hint }: { label: string; value: ReactNode; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">
        {label}
        {hint && <span className="block text-xs">{hint}</span>}
      </span>
      <span className={cn('tabular-nums text-right', strong ? 'text-lg font-bold' : 'font-medium')}>{value}</span>
    </div>
  );
}

// RF-021: cenários independentes (tripId nulo) ou da viagem.
export function PricingSimulator({ tripId }: { tripId: string | null }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = can('pricing.write');
  const key = ['pricing-scenarios', tripId ?? 'independentes'];

  const scenarios = useQuery({ queryKey: key, queryFn: () => listScenarios(tripId) });
  const defaults = useQuery({ queryKey: ['pricing-defaults', tripId], queryFn: () => getPricingDefaults(tripId!), enabled: !!tripId });

  const [selected, setSelected] = useState<string | 'novo' | null>(null);
  const [form, setForm] = useState<Form>(toForm(blank));
  const current = scenarios.data?.find((s) => s.id === selected) ?? null;

  useEffect(() => {
    if (selected === null && scenarios.data) setSelected(scenarios.data[0]?.id ?? 'novo');
  }, [scenarios.data, selected]);
  useEffect(() => {
    if (current) setForm(toForm(current));
    else if (selected === 'novo') setForm(toForm(blank));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => fromForm(form), [form]);
  const result = typeof parsed === 'string' ? null : calculatePricing(parsed);
  const comparison = useMemo(() => {
    if (typeof parsed === 'string') return [];
    const n = parsed.paying_passengers;
    const counts = new Set([Math.max(1, Math.round(n * 0.5)), Math.max(1, Math.round(n * 0.75)), n, Math.round(n * 1.25)]);
    if (parsed.vehicle_capacity) counts.add(Math.max(1, parsed.vehicle_capacity - parsed.courtesy_passengers));
    return compareByPassengers(parsed, [...counts].sort((a, b) => a - b));
  }, [parsed]);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const fail = (err: Error) => toast({ title: 'Não foi possível concluir', description: err.message, variant: 'destructive' });

  const save = useMutation({
    mutationFn: (input: PricingScenarioInput) => (current ? updateScenario(current.id, input) : createScenario(tripId, input)),
    onSuccess: (s: PricingScenario) => {
      invalidate();
      setSelected(s.id);
      toast({ title: 'Cenário salvo' });
    },
    onError: fail,
  });
  const duplicate = useMutation({
    mutationFn: (input: PricingScenarioInput) => createScenario(tripId, { ...input, name: `${input.name} (cópia)` }),
    onSuccess: (s) => {
      invalidate();
      setSelected(s.id);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteScenario(id),
    onSuccess: () => {
      invalidate();
      setSelected(null);
    },
    onError: fail,
  });
  const apply = useMutation({
    mutationFn: (id: string) => applyScenario(id),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      queryClient.invalidateQueries({ queryKey: ['pricing-defaults', tripId] });
      toast({ title: 'Preço aplicado', description: `Valor padrão do pacote: ${formatBRL(r.default_package_price)}` });
    },
    onError: fail,
  });

  const loadFromTrip = () => {
    const d = defaults.data;
    if (!d) return;
    setForm((f) => ({
      ...f,
      paying_passengers: String(d.paying_passengers),
      courtesy_passengers: String(d.courtesy_passengers),
      vehicle_capacity: d.vehicle_capacity ? String(d.vehicle_capacity) : f.vehicle_capacity,
      fixed_costs: centsToInput(d.fixed_costs),
      variable_cost_per_person: centsToInput(d.variable_cost_per_person),
    }));
    toast({ title: 'Dados da viagem carregados', description: 'Despesas lançadas, passageiros e capacidade dos veículos.' });
  };

  if (scenarios.isLoading) return <Skeleton className="h-64 rounded-xl" />;

  const savedChanged = current && typeof parsed !== 'string' && JSON.stringify(parsed) !== JSON.stringify(Object.fromEntries(Object.keys(parsed).map((k) => [k, current[k as keyof PricingScenarioInput]])));

  const field = (k: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`sim-${k}`} className="text-xs">
        {label}
      </Label>
      <Input id={`sim-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.data!.map((s) => (
          <Button key={s.id} size="sm" variant={s.id === selected ? 'secondary' : 'outline'} onClick={() => setSelected(s.id)}>
            {s.name}
          </Button>
        ))}
        {canWrite && (
          <Button size="sm" variant={selected === 'novo' ? 'secondary' : 'ghost'} onClick={() => setSelected('novo')}>
            <Plus className="h-4 w-4" /> Novo cenário
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] items-start">
        <Card className="min-w-0">
          <CardContent className="p-4 space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-48">{field('name', 'Nome do cenário')}</div>
              {tripId && canWrite && (
                <Button type="button" variant="outline" size="sm" onClick={loadFromTrip} disabled={!defaults.data}>
                  <Download className="h-4 w-4" /> Usar dados da viagem
                </Button>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Passageiros</legend>
              <div className="grid gap-3 grid-cols-3">
                {field('paying_passengers', 'Pagantes', { type: 'number', min: 1 })}
                {field('courtesy_passengers', 'Cortesias', { type: 'number', min: 0 })}
                {field('vehicle_capacity', 'Capacidade do veículo', { type: 'number', min: 1, placeholder: '—' })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Custos</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('fixed_costs', 'Despesas fixas (R$)', { inputMode: 'decimal' }, 'Ônibus, guia, taxas…')}
                {field('variable_cost_per_person', 'Despesa por pessoa (R$)', { inputMode: 'decimal' }, 'Hospedagem, café… (cortesias também)')}
                <div className="space-y-1">
                  <Label className="text-xs">Reserva para imprevistos</Label>
                  <div className="flex gap-2">
                    <Select value={form.contingency_type} onValueChange={(v) => setForm((f) => ({ ...f, contingency_type: v as Form['contingency_type'], contingency_value: '' }))}>
                      <SelectTrigger className="w-24" aria-label="Tipo de reserva para imprevistos">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTUAL">%</SelectItem>
                        <SelectItem value="FIXO">R$</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input aria-label="Valor da reserva para imprevistos" inputMode="decimal" value={form.contingency_value} onChange={(e) => set('contingency_value', e.target.value)} placeholder="0" />
                  </div>
                </div>
                {field('discounts', 'Descontos no total (R$)', { inputMode: 'decimal', placeholder: '0,00' })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Preço</legend>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {field('installment_fee', 'Taxa de parcelamento (%)', { inputMode: 'decimal', placeholder: '0' })}
                {field('desired_margin', 'Margem desejada (%)', { inputMode: 'decimal' })}
                {field('desired_price', 'Preço a testar (R$)', { inputMode: 'decimal', placeholder: 'Usa o sugerido' })}
              </div>
            </fieldset>

            {typeof parsed === 'string' && (
              <p className="text-sm text-destructive" role="alert">
                {parsed}
              </p>
            )}

            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => typeof parsed !== 'string' && save.mutate(parsed)} disabled={typeof parsed === 'string' || save.isPending || (!!current && !savedChanged)}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {current ? 'Salvar alterações' : 'Salvar cenário'}
                </Button>
                {current && (
                  <>
                    <Button variant="outline" onClick={() => typeof parsed !== 'string' && duplicate.mutate(parsed)} disabled={typeof parsed === 'string'}>
                      <Copy className="h-4 w-4" /> Duplicar
                    </Button>
                    <Button variant="ghost" className="text-destructive" onClick={() => remove.mutate(current.id)}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:sticky lg:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-sm text-muted-foreground">Preencha os dados para ver o resultado.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <Out label="Custo total" value={formatBRL(result.total_cost)} hint={result.contingency ? `inclui ${formatBRL(result.contingency)} de imprevistos` : undefined} />
                  <Out label="Custo por pagante" value={formatBRL(result.cost_per_paying)} />
                  <Out label="Preço mínimo" value={formatBRL(result.minimum_price)} hint="Lucro zero" />
                  <Out label="Preço sugerido" value={formatBRL(result.suggested_price)} strong hint={`Com ${form.desired_margin || 0}% de margem`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mt-2">
                    {typeof parsed !== 'string' && parsed.desired_price ? 'No preço testado' : 'No preço sugerido'} ({formatBRL(result.price)})
                  </p>
                  <Out label="Receita estimada" value={formatBRL(result.estimated_revenue)} />
                  {result.fees > 0 && <Out label="Taxas" value={formatBRL(result.fees)} />}
                  <Out
                    label="Lucro estimado"
                    value={
                      <span className={cn('inline-flex items-center gap-1', result.estimated_profit < 0 && 'text-destructive')}>
                        {result.estimated_profit < 0 && <AlertTriangle className="h-4 w-4" aria-label="prejuízo" />}
                        {formatBRL(result.estimated_profit)}
                      </span>
                    }
                  />
                  <Out label="Margem estimada" value={formatPercent(result.estimated_margin)} />
                  <Out label="Ponto de equilíbrio" value={result.break_even_passengers === null ? 'Não atinge' : `${result.break_even_passengers} pagantes`} />
                </div>
                {result.warnings.map((w) => (
                  <p key={w} className="text-sm text-warning flex items-start gap-2" role="status">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
                {tripId && current && can('trips.write') && !savedChanged && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm">
                      Preço atual do pacote: <strong>{defaults.data ? formatBRL(defaults.data.current_price) : '…'}</strong>
                    </p>
                    <Button size="sm" variant="outline" onClick={() => apply.mutate(current.id)} disabled={apply.isPending || defaults.data?.current_price === result.price}>
                      <Tag className="h-4 w-4" /> Usar {formatBRL(result.price)} no pacote
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {comparison.length > 0 && (
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comparar quantidades de passageiros</CardTitle>
            <p className="text-sm text-muted-foreground">Mesmo preço ({result && formatBRL(result.price)}), variando os pagantes.</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pagantes</TableHead>
                  <TableHead className="text-right">Custo total</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((c) => (
                  <TableRow key={c.paying_passengers} className={typeof parsed !== 'string' && c.paying_passengers === parsed.paying_passengers ? 'bg-muted/50 font-medium' : undefined}>
                    <TableCell>
                      {c.paying_passengers}
                      {typeof parsed !== 'string' && c.paying_passengers === parsed.paying_passengers && <Badge variant="outline" className="ml-2">cenário</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(c.total_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(c.revenue)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', c.profit < 0 && 'text-destructive')}>
                      {c.profit < 0 ? '− ' : ''}
                      {formatBRL(Math.abs(c.profit))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(c.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
