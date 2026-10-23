import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getFileUrl, uploadReceipt } from '@/lib/finance.service';
import type { FileRef } from '@/types';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';

// Anexar comprovante (PDF ou imagem, até 5 MB). O servidor confere o tipo.
export function ReceiptField({ value, onChange }: { value: FileRef | null; onChange: (file: FileRef | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('O arquivo passa de 5 MB.');
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadReceipt(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-1">
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className="flex items-center gap-2 truncate">
            <FileText className="h-4 w-4 shrink-0" /> {value.original_name}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label="Remover comprovante">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Anexar comprovante
        </Button>
      )}
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" aria-label="Arquivo do comprovante" onChange={(e) => pick(e.target.files?.[0])} />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Abre o comprovante num link temporário.
export function ReceiptLink({ file }: { file: FileRef }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    // Abre a aba antes do await pra o navegador não bloquear como pop-up.
    const win = window.open('', '_blank');
    setBusy(true);
    try {
      const { url } = await getFileUrl(file.id);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      toast({ title: 'Não foi possível abrir o comprovante', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={open} disabled={busy} aria-label={`Abrir comprovante ${file.original_name}`} title={file.original_name}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
    </Button>
  );
}
