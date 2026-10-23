import { useEffect, useState } from 'react';
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
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

// Operações sensíveis (estorno, cancelamento) pedem motivo, que vai pra auditoria.
export function ReasonDialog({ open, title, description, confirmLabel, busy, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [open]);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason-text">Motivo</Label>
          <Textarea id="reason-text" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button variant="destructive" disabled={reason.trim().length < 3 || busy} onClick={() => onConfirm(reason.trim())}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
