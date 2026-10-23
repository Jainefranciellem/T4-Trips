import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomerPicker } from '@/components/reservations/CustomerPicker';
import { ReasonDialog } from '@/components/finance/ReasonDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { addCustomerLink, anonymizeCustomer, exportCustomerData, listCustomerLinks, listCustomerTrips, removeCustomerLink } from '@/lib/customers.service';
import { formatBRL, formatCpf, formatDate, formatDay, formatPhone } from '@/lib/format';
import { financialStatusLabel, financialStatusVariant, reservationStatusLabel } from '@/lib/constants';
import type { Customer } from '@/types';
import { Download, Loader2, ShieldAlert, Trash2, UserPlus } from 'lucide-react';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value}</dd>
    </div>
  );
}

// Ficha do cliente (RF-005): dados, histórico de viagens, vínculos e LGPD.
export function CustomerDetailDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkTo, setLinkTo] = useState<Customer | null>(null);
  const [kind, setKind] = useState('');
  const [group, setGroup] = useState('');
  const [anonymizing, setAnonymizing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const id = customer?.id;
  const trips = useQuery({ queryKey: ['customer-trips', id], queryFn: () => listCustomerTrips(id!), enabled: !!id });
  const links = useQuery({ queryKey: ['customer-links', id], queryFn: () => listCustomerLinks(id!), enabled: !!id });
  const fail = (err: Error) => toast({ title: 'Não foi possível concluir', description: err.message, variant: 'destructive' });

  const add = useMutation({
    mutationFn: () => addCustomerLink(id!, { related_customer_id: linkTo!.id, relationship_type: kind.trim(), group_name: group.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-links'] });
      setLinkTo(null);
      setKind('');
      setGroup('');
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: removeCustomerLink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-links'] }),
    onError: fail,
  });
  const anonymize = useMutation({
    mutationFn: (reason: string) => anonymizeCustomer(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Dados pessoais removidos', description: 'O histórico financeiro foi mantido sem identificar a pessoa.' });
      setAnonymizing(false);
      onClose();
    },
    onError: (err: Error) => {
      setAnonymizing(false);
      fail(err);
    },
  });

  if (!customer) return null;
  const anonymized = !!customer.anonymized_at;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {customer.full_name}
            {customer.status === 'ARQUIVADO' && <Badge variant="cancelled">{anonymized ? 'Anonimizado' : 'Arquivado'}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="viagens">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="viagens">Viagens</TabsTrigger>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="vinculos">Família e grupo</TabsTrigger>
            {can('privacy.manage') && <TabsTrigger value="privacidade">Privacidade</TabsTrigger>}
          </TabsList>

          <TabsContent value="viagens" className="space-y-2">
            {trips.isLoading ? (
              <Skeleton className="h-24" />
            ) : (trips.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não participou de nenhuma viagem.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {trips.data!.map((t) => (
                  <li key={t.reservation_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div>
                      <Link to={`/viagens/${t.trip.id}/passageiros`} className="font-medium hover:text-primary" onClick={onClose}>
                        {t.trip.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t.trip.destination} · {formatDate(t.trip.departure_at)} · {reservationStatusLabel[t.reservation_status]}
                      </p>
                    </div>
                    {t.financial_status && (
                      <div className="text-right">
                        <Badge variant={financialStatusVariant[t.financial_status]}>{financialStatusLabel[t.financial_status]}</Badge>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          pago {formatBRL(t.paid ?? 0)} de {formatBRL(t.final_price ?? 0)}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="dados">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="CPF" value={customer.cpf ? formatCpf(customer.cpf) : null} />
              <Field label="Nascimento" value={customer.birth_date ? formatDay(customer.birth_date) : null} />
              <Field label="WhatsApp" value={customer.whatsapp ? formatPhone(customer.whatsapp) : null} />
              <Field label="Telefone" value={customer.phone ? formatPhone(customer.phone) : null} />
              <Field label="E-mail" value={customer.email} />
              <Field label="Cidade" value={[customer.city, customer.state].filter(Boolean).join(' / ')} />
              <Field label="Contato de emergência" value={[customer.emergency_contact_name, formatPhone(customer.emergency_contact_phone)].filter((v) => v && v !== '—').join(' · ')} />
              <Field label="Responsável" value={[customer.guardian_name, formatPhone(customer.guardian_phone)].filter((v) => v && v !== '—').join(' · ')} />
              <Field label="Observações internas" value={customer.notes} />
            </dl>
            {!can('sensitive.view') && <p className="text-xs text-muted-foreground mt-3">Seu perfil não vê documentos e contatos.</p>}
          </TabsContent>

          <TabsContent value="vinculos" className="space-y-4">
            <p className="text-sm text-muted-foreground">Ligue familiares, acompanhantes ou amigos. Na viagem, o sistema sugere colocar o grupo no mesmo quarto.</p>
            {(links.data ?? []).length > 0 && (
              <ul className="divide-y rounded-lg border">
                {links.data!.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{l.customer.full_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {l.relationship_type}
                        {l.group_name && ` · ${l.group_name}`}
                      </span>
                    </span>
                    {can('customers.write') && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Desfazer vínculo com ${l.customer.full_name}`} onClick={() => remove.mutate(l.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {can('customers.write') && !anonymized && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Novo vínculo
                </p>
                <CustomerPicker value={linkTo} onChange={(c) => setLinkTo(c && c.id !== customer.id ? c : null)} />
                {linkTo && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="link-kind" className="text-xs">Vínculo</Label>
                      <Input id="link-kind" placeholder="Ex.: mãe, irmão, amiga" value={kind} onChange={(e) => setKind(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="link-group" className="text-xs">Nome do grupo (opcional)</Label>
                      <Input id="link-group" placeholder="Ex.: Família Souza" value={group} onChange={(e) => setGroup(e.target.value)} />
                    </div>
                    <Button size="sm" className="sm:col-span-2 justify-self-start" disabled={kind.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>
                      {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Vincular
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {can('privacy.manage') && (
            <TabsContent value="privacidade" className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Pedido do titular (LGPD)</p>
                <p className="text-sm text-muted-foreground">Gera um arquivo com todos os dados que a T4 Trips guarda sobre este cliente: cadastro, vínculos, viagens e pagamentos.</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    await exportCustomerData(customer.id).catch(fail);
                    setExporting(false);
                  }}
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar dados
                </Button>
              </div>
              {!anonymized && (
                <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" /> Anonimizar cadastro
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Apaga nome, CPF, contatos e observações de forma definitiva. Valores pagos continuam nos relatórios, sem identificar a pessoa. Só é possível sem viagem em aberto.
                  </p>
                  <Button variant="destructive" size="sm" onClick={() => setAnonymizing(true)}>
                    Anonimizar
                  </Button>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        <ReasonDialog
          open={anonymizing}
          title={`Anonimizar ${customer.full_name}?`}
          description="Não dá para desfazer. Registre o motivo (ex.: pedido do titular por e-mail em tal data)."
          confirmLabel="Anonimizar"
          busy={anonymize.isPending}
          onCancel={() => setAnonymizing(false)}
          onConfirm={(reason) => anonymize.mutate(reason)}
        />
      </DialogContent>
    </Dialog>
  );
}
