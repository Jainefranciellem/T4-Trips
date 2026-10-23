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
import { cancelTrip } from '@/lib/trips.service';
import type { Trip } from '@/types';
import { Loader2 } from 'lucide-react';

export function CancelTripDialog({ trip, onOpenChange }: { trip: Trip | null; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => setReason(''), [trip]);

  const mutation = useMutation({
    mutationFn: () => cancelTrip(trip!.id, reason.trim()),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', saved.id] });
      toast({ title: 'Viagem cancelada' });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: 'Não foi possível cancelar', description: err.message, variant: 'destructive' }),
  });

  return (
    <AlertDialog open={!!trip} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar “{trip?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            A viagem fica guardada para consulta, mas não recebe mais reservas. O motivo fica no histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Motivo</Label>
          <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancelar viagem
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
