import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getReport, listReports, type ReportCatalog, type ReportFormat, type ReportInfo } from '@/lib/reports.service';
import type { Trip } from '@/types';
import { FileSpreadsheet, FileText, Loader2, Sheet } from 'lucide-react';

const ALL = '__todos';

const statusOptions = [
  ['ativos', 'Passageiros ativos'],
  ['confirmados', 'Só confirmados'],
  ['lista_espera', 'Lista de espera'],
  ['cancelados', 'Canceladas'],
  ['todos', 'Todas as reservas'],
] as const;

function ReportCard({ trip, info, options }: { trip: Trip; info: ReportInfo; options: ReportCatalog['options'] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v === ALL ? '' : v }));

  const run = async (format: ReportFormat) => {
    setBusy(format);
    try {
      await getReport(trip.id, info.slug, format, params);
    } catch (err) {
      toast({ title: 'Não foi possível gerar o relatório', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const select = (key: string, label: string, items: readonly (readonly [string, string])[], placeholder: string) => (
    <div className="space-y-1 min-w-40 flex-1">
      <Label className="text-xs">{label}</Label>
      <Select value={params[key] || ALL} onValueChange={(v) => set(key, v)}>
        <SelectTrigger className="h-9" aria-label={`${label} · ${info.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {items.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card className="min-w-0">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="font-medium">{info.title}</p>
          <p className="text-sm text-muted-foreground">{info.description}</p>
        </div>

        {info.filters.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {info.filters.includes('status') && select('status', 'Situação', statusOptions.slice(1), 'Passageiros ativos')}
            {info.filters.includes('vehicle') && options.vehicles.length > 0 &&
              select('vehicle_id', 'Veículo', options.vehicles.map((v) => [v.id, v.name] as const), 'Todos os veículos')}
            {info.filters.includes('accommodation') && options.accommodations.length > 0 &&
              select('accommodation_id', 'Pousada', options.accommodations.map((a) => [a.id, a.name] as const), 'Todas as pousadas')}
            {info.filters.includes('period') && (
              <>
                <div className="space-y-1">
                  <Label htmlFor={`${info.slug}-from`} className="text-xs">De</Label>
                  <Input id={`${info.slug}-from`} type="date" className="h-9" value={params.from ?? ''} onChange={(e) => set('from', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${info.slug}-to`} className="text-xs">Até</Label>
                  <Input id={`${info.slug}-to`} type="date" className="h-9" value={params.to ?? ''} onChange={(e) => set('to', e.target.value)} />
                </div>
              </>
            )}
            {info.filters.includes('internal') && user?.role !== 'VISUALIZADOR' && (
              <label className="flex items-center gap-2 text-sm self-end pb-2">
                <Checkbox checked={params.internal === '1'} onCheckedChange={(v) => set('internal', v ? '1' : '')} />
                Incluir itens internos
              </label>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run('pdf')} disabled={!!busy}>
            {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => run('xlsx')} disabled={!!busy}>
            {busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run('csv')} disabled={!!busy}>
            {busy === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />} CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// RF-022: só aparecem os relatórios que o perfil pode gerar.
export function ReportsPanel({ trip }: { trip: Trip }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['reports', trip.id], queryFn: () => listReports(trip.id) });
  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (isError || !data) return <p className="text-destructive">{(error as Error)?.message}</p>;

  const section = (title: string, list: ReportInfo[]) =>
    list.length > 0 && (
      <section className="space-y-3">
        <h3 className="font-semibold">{title}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((r) => (
            <ReportCard key={r.slug} trip={trip} info={r} options={data.options} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="space-y-6">
      {section('Operacionais', data.reports.filter((r) => !r.financial))}
      {section('Financeiros', data.reports.filter((r) => r.financial))}
      <p className="text-xs text-muted-foreground">
        Os arquivos levam o nome da T4 Trips, a viagem, a data, quem gerou e os filtros usados. CPF e contatos só aparecem para quem pode ver dados pessoais; a lista de embarque sempre mascara o CPF.
      </p>
    </div>
  );
}
