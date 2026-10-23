import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cancelReservation } from '@/lib/reservations.service';
import type { Reservation } from '@/types';
import { Loader2 } from 'lucide-react';

export function CancelReservationDialog({ reservation, onOpenChange }: { reservation: Reservation | null; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => setReason(''), [reservation]);

  const mutation = useMutation({
    mutationFn: () => cancelReservation(reservation!.id, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', reservation!.trip_id] });
      queryClient.invalidateQueries({ queryKey: ['trip', reservation!.trip_id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast({ title: 'Reserva cancelada', description: 'A vaga foi liberada.' });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: 'Não foi possível cancelar', description: err.message, variant: 'destructive' }),
  });

  return (
    <AlertDialog open={!!reservation} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar a reserva de {reservation?.passenger_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A vaga é liberada e o link do passageiro para de funcionar. Os pagamentos continuam no histórico; o reembolso, se houver, é lançado depois em Pagamentos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="res-cancel-reason">Motivo</Label>
          <Textarea id="res-cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button variant="destructive" disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancelar reserva
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
