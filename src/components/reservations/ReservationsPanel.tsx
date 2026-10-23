import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { listReservations, regeneratePublicLink, revokePublicLink } from '@/lib/reservations.service';
import { formatBRL, formatDateShort, formatPhone } from '@/lib/format';
import { reservationStatusLabel, reservationStatusVariant } from '@/lib/constants';
import type { Reservation, ReservationStatus, Trip } from '@/types';
import { Ban, Link2, Link2Off, MoreVertical, Pencil, Plus, Search, Wallet } from 'lucide-react';
import { ReservationFinanceDialog } from '@/components/finance/ReservationFinanceDialog';
import { ReservationFormDialog } from './ReservationFormDialog';
import { PublicLinkDialog } from './PublicLinkDialog';
import { CancelReservationDialog } from './CancelReservationDialog';

const ENDED: ReservationStatus[] = ['CANCELADA', 'REEMBOLSADA'];
const isEnded = (r: Reservation) => ENDED.includes(r.reservation_status);
const OPEN_TRIP = (t: Trip) => !['CANCELADA', 'ARQUIVADA', 'CONCLUIDA'].includes(t.status);

const linkLabel = { SEM_LINK: 'Sem link', ATIVO: 'Ativo', REVOGADO: 'Revogado', EXPIRADO: 'Expirado', INATIVO: 'Inativo' } as const;

function StatusBadge({ r }: { r: Reservation }) {
  if (r.hold_expired) return <Badge variant="missed">Pré-reserva vencida</Badge>;
  return <Badge variant={reservationStatusVariant[r.reservation_status]}>{reservationStatusLabel[r.reservation_status]}</Badge>;
}

// "Passageiros" mostra quem está na viagem e a lista de espera; "Reservas"
// mostra todas, inclusive canceladas, com filtro de status.
export function ReservationsPanel({ trip, mode }: { trip: Trip; mode: 'passageiros' | 'reservas' }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'TODAS' | ReservationStatus>('TODAS');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [link, setLink] = useState<{ reservation: Reservation; url: string } | null>(null);
  const [financeFor, setFinanceFor] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reservations', trip.id],
    queryFn: () => listReservations(trip.id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reservations', trip.id] });
  const regenerate = useMutation({
    mutationFn: regeneratePublicLink,
    onSuccess: (res) => {
      invalidate();
      setLink({ reservation: res.reservation, url: res.public_url });
    },
    onError: (err: Error) => toast({ title: 'Não foi possível gerar o link', description: err.message, variant: 'destructive' }),
  });
  const revoke = useMutation({
    mutationFn: revokePublicLink,
    onSuccess: () => {
      invalidate();
      toast({ title: 'Link revogado', description: 'A página do passageiro deixou de abrir.' });
    },
    onError: (err: Error) => toast({ title: 'Não foi possível revogar', description: err.message, variant: 'destructive' }),
  });

  const canWrite = can('reservations.write') && OPEN_TRIP(trip);
  const showPrices = data?.some((r) => r.final_price !== null) ?? false;
  const term = search.trim().toLowerCase();
  const matches = (r: Reservation) => !term || r.passenger_name.toLowerCase().includes(term);

  const all = (data ?? []).filter(matches);
  const rows =
    mode === 'passageiros'
      ? all.filter((r) => !isEnded(r) && r.reservation_status !== 'LISTA_ESPERA')
      : all.filter((r) => status === 'TODAS' || r.reservation_status === status);
  const waitlist = mode === 'passageiros' ? all.filter((r) => r.reservation_status === 'LISTA_ESPERA') : [];

  const actions = (r: Reservation) =>
    can('reservations.write') && !isEnded(r) ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${r.passenger_name}`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setEditing(r);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Editar reserva
          </DropdownMenuItem>
          {(can('finance.write') || can('finance.read')) && (
            <DropdownMenuItem onClick={() => setFinanceFor(r.id)}>
              <Wallet className="h-4 w-4" /> Pagamentos
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => regenerate.mutate(r.id)}>
            <Link2 className="h-4 w-4" /> {r.public_link === 'ATIVO' ? 'Gerar novo link' : 'Gerar link'}
          </DropdownMenuItem>
          {can('links.revoke') && r.public_link === 'ATIVO' && (
            <DropdownMenuItem onClick={() => revoke.mutate(r.id)}>
              <Link2Off className="h-4 w-4" /> Revogar link
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancelling(r)}>
            <Ban className="h-4 w-4" /> Cancelar reserva
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const list = (items: Reservation[], empty: string) =>
    items.length === 0 ? (
      <div className="text-center py-10 border border-dashed rounded-xl text-sm text-muted-foreground">{empty}</div>
    ) : (
      <>
        <div className="space-y-2 md:hidden">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-2">
              <div className="min-w-0 text-sm space-y-1">
                <p className="font-medium">{r.passenger_name}</p>
                <StatusBadge r={r} />
                {r.seat && <p className="text-muted-foreground">Assento {r.seat.seat_number} · {r.seat.vehicle_name}</p>}
                {r.room && <p className="text-muted-foreground">Quarto {r.room.room_identifier} · {r.room.accommodation_name}</p>}
                {r.final_price !== null && (
                  <p className="text-muted-foreground">
                    {r.is_courtesy ? 'Cortesia' : formatBRL(r.final_price)}
                    {r.payment_due_date && ` · vence ${formatDateShort(r.payment_due_date)}`}
                  </p>
                )}
                {r.cancel_reason && <p className="text-muted-foreground">Motivo: {r.cancel_reason}</p>}
              </div>
              {actions(r)}
            </div>
          ))}
        </div>
        <div className="hidden md:block rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Passageiro</TableHead>
                <TableHead>Status</TableHead>
                {showPrices && <TableHead className="text-right">Valor</TableHead>}
                <TableHead>Assento</TableHead>
                <TableHead>Quarto</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.passenger_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.cancel_reason ? `Motivo: ${r.cancel_reason}` : formatPhone(r.customer.whatsapp ?? r.customer.phone)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge r={r} />
                  </TableCell>
                  {showPrices && (
                    <TableCell className="text-right whitespace-nowrap">
                      {r.is_courtesy ? 'Cortesia' : r.final_price !== null ? formatBRL(r.final_price) : '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-sm whitespace-nowrap">
                    {r.seat ? `${r.seat.seat_number} · ${r.seat.vehicle_name}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {r.room ? `${r.room.room_identifier} · ${r.room.accommodation_name}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.payment_due_date ? formatDateShort(r.payment_due_date) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{linkLabel[r.public_link]}</TableCell>
                  <TableCell>{actions(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );

  const s = trip.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          <strong>{s.occupied}</strong> de {trip.commercial_capacity} vagas ocupadas
        </span>
        <span className="text-muted-foreground">{s.available_seats} livre(s)</span>
        {s.waitlist > 0 && <span className="text-muted-foreground">{s.waitlist} na lista de espera</span>}
        {s.expired_holds > 0 && <span className="text-warning">{s.expired_holds} pré-reserva(s) vencida(s)</span>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar passageiro" aria-label="Buscar passageiro" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {mode === 'reservas' && (
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="sm:w-52" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todos os status</SelectItem>
              {(Object.keys(reservationStatusLabel) as ReservationStatus[]).map((st) => (
                <SelectItem key={st} value={st}>
                  {reservationStatusLabel[st]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Adicionar passageiro
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : isError ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : (
        <>
          {list(rows, term ? 'Ninguém encontrado com esse nome.' : mode === 'passageiros' ? 'Nenhum passageiro ainda.' : 'Nenhuma reserva.')}
          {waitlist.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Lista de espera</h3>
              {list(waitlist, '')}
            </div>
          )}
        </>
      )}

      <ReservationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trip={trip}
        reservation={editing}
        onCreated={(reservation, url) => setLink({ reservation, url })}
      />
      <CancelReservationDialog reservation={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
      <PublicLinkDialog link={link} trip={trip} onOpenChange={(o) => !o && setLink(null)} />
      <ReservationFinanceDialog reservationId={financeFor} tripId={trip.id} onClose={() => setFinanceFor(null)} />
    </div>
  );
}
