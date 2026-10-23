import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Reservation, Trip } from '@/types';
import { Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';

interface Props {
  link: { reservation: Reservation; url: string } | null;
  trip: Trip;
  onOpenChange: (open: boolean) => void;
}

// Mensagem da seção 9.4: saudação, nome, viagem, link e orientação.
export function shareMessage(name: string, tripName: string, url: string) {
  const first = name.split(' ')[0];
  return (
    `Olá, ${first}! Aqui está o link com as informações da sua viagem ${tripName}:\n${url}\n\n` +
    'Por ele você consulta horário e local de saída, assento, quarto e roteiro.'
  );
}

export function PublicLinkDialog({ link, trip, onOpenChange }: Props) {
  const { toast } = useToast();
  if (!link) return null;
  const { reservation, url } = link;
  const message = shareMessage(reservation.passenger_name, trip.name, url);
  const phone = (reservation.customer.whatsapp ?? '').replace(/\D/g, '');
  const waUrl = `https://wa.me/${phone ? (phone.length <= 11 ? `55${phone}` : phone) : ''}?text=${encodeURIComponent(message)}`;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Selecione o link e copie manualmente.', variant: 'destructive' });
    }
  };

  const share = () => navigator.share({ title: trip.name, text: message }).catch(() => undefined);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link de {reservation.passenger_name}</DialogTitle>
          <DialogDescription>
            Guarde ou envie agora: por segurança, este link não fica salvo. Para mandar de novo depois, gere um link novo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input readOnly value={url} aria-label="Link do passageiro" onFocus={(e) => e.target.select()} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={copy} variant="outline">
              <Copy className="h-4 w-4" /> Copiar link
            </Button>
            <Button asChild variant="success">
              <a href={waUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
              </a>
            </Button>
            {canShare && (
              <Button onClick={share} variant="outline">
                <Share2 className="h-4 w-4" /> Compartilhar
              </Button>
            )}
            <Button asChild variant="ghost">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Ver página
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
