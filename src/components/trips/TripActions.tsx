import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { archiveTrip, duplicateTrip, restoreTrip } from '@/lib/trips.service';
import { canArchiveTrip, canCancelTrip, canEditTrip } from '@/lib/trip-rules';
import type { Trip } from '@/types';
import { Archive, ArchiveRestore, Ban, Copy, ExternalLink, MoreVertical, Pencil } from 'lucide-react';

interface Props {
  trip: Trip;
  onEdit: (trip: Trip) => void;
  onCancel: (trip: Trip) => void;
}

export function TripActions({ trip, onEdit, onCancel }: Props) {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = can('trips.write');

  const action = useMutation({
    mutationFn: (fn: () => Promise<Trip>) => fn(),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
      if (saved.id !== trip.id) {
        toast({ title: 'Viagem duplicada', description: 'A cópia foi criada como planejada.' });
        navigate(`/viagens/${saved.id}/configuracoes`);
      }
    },
    onError: (err: Error) => toast({ title: 'Ação não concluída', description: err.message, variant: 'destructive' }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${trip.name}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(`/viagens/${trip.id}`)}>
          <ExternalLink className="h-4 w-4" /> Abrir
        </DropdownMenuItem>
        {canWrite && (
          <>
            {user && canEditTrip(trip.status, user.role) && (
              <DropdownMenuItem onClick={() => onEdit(trip)}>
                <Pencil className="h-4 w-4" /> Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => action.mutate(() => duplicateTrip(trip.id))}>
              <Copy className="h-4 w-4" /> Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {trip.status === 'ARQUIVADA' ? (
              <DropdownMenuItem
                onClick={() => action.mutate(() => restoreTrip(trip.id), { onSuccess: () => toast({ title: 'Viagem restaurada' }) })}
              >
                <ArchiveRestore className="h-4 w-4" /> Restaurar
              </DropdownMenuItem>
            ) : (
              canArchiveTrip(trip.status) && (
                <DropdownMenuItem
                  onClick={() => action.mutate(() => archiveTrip(trip.id), { onSuccess: () => toast({ title: 'Viagem arquivada' }) })}
                >
                  <Archive className="h-4 w-4" /> Arquivar
                </DropdownMenuItem>
              )
            )}
            {canCancelTrip(trip.status) && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onCancel(trip)}>
                <Ban className="h-4 w-4" /> Cancelar viagem
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
