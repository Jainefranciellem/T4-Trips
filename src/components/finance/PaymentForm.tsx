import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { centsToInput, parseBRLToCents, todayISO } from '@/lib/format';
import { paymentMethodLabel } from '@/lib/constants';
import type { FileRef, PaymentMethod } from '@/types';
import { Loader2 } from 'lucide-react';
import { ReceiptField } from './Receipt';

export interface PaymentFormValues {
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  receipt_file_id: string | null;
  reason?: string;
}

interface Props {
  suggestedAmount: number;
  submitLabel: string;
  busy: boolean;
  withReceipt?: boolean;
  // Reembolso pede motivo.
  withReason?: boolean;
  onSubmit: (values: PaymentFormValues) => void;
}

const methods = Object.keys(paymentMethodLabel) as PaymentMethod[];

export function PaymentForm({ suggestedAmount, submitLabel, busy, withReceipt = true, withReason = false, onSubmit }: Props) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState<FileRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setAmount(suggestedAmount > 0 ? centsToInput(suggestedAmount) : ''), [suggestedAmount]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cents = parseBRLToCents(amount);
    if (!cents) return setError('Informe o valor.');
    if (!date) return setError('Informe a data.');
    if (withReason && reason.trim().length < 3) return setError('Informe o motivo.');
    setError(null);
    onSubmit({
      amount: cents,
      payment_date: date,
      payment_method: method,
      reference: reference.trim() || null,
      receipt_file_id: receipt?.id ?? null,
      ...(withReason ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-amount">Valor (R$)</Label>
          <Input id="pf-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-date">Data</Label>
          <Input id="pf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Forma</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger aria-label="Forma de pagamento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {paymentMethodLabel[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-ref">Identificador</Label>
          <Input id="pf-ref" placeholder="ID do Pix, nº do recibo…" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        {withReason && (
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="pf-reason">Motivo</Label>
            <Input id="pf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </div>
      {withReceipt && <ReceiptField value={receipt} onChange={setReceipt} />}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
