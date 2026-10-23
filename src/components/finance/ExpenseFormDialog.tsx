import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createExpense, createExpenseCategory, listExpenseCategories, updateExpense } from '@/lib/finance.service';
import { centsToInput, parseBRLToCents } from '@/lib/format';
import { costTypeLabel } from '@/lib/constants';
import type { CostType, FileRef, TripExpense } from '@/types';
import { Check, Loader2, Plus } from 'lucide-react';
import { ReceiptField } from './Receipt';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  expense?: TripExpense | null;
}

export function ExpenseFormDialog({ open, onOpenChange, tripId, expense }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: listExpenseCategories, enabled: open });
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [costType, setCostType] = useState<CostType>('FIXO');
  const [planned, setPlanned] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<FileRef | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategoryId(expense?.category.id ?? '');
    setDescription(expense?.description ?? '');
    setSupplier(expense?.supplier_name ?? '');
    setCostType(expense?.cost_type ?? 'FIXO');
    setPlanned(expense ? centsToInput(expense.planned_amount) : '');
    setDue(expense?.due_date ?? '');
    setNotes(expense?.notes ?? '');
    setReceipt(expense?.receipt ?? null);
    setNewCategory(null);
    setError(null);
  }, [open, expense]);

  const addCategory = useMutation({
    mutationFn: (name: string) => createExpenseCategory(name),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setCategoryId(c.id);
      setNewCategory(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        category_id: categoryId,
        description: description.trim(),
        supplier_name: supplier.trim() || null,
        cost_type: costType,
        planned_amount: parseBRLToCents(planned)!,
        due_date: due || null,
        notes: notes.trim() || null,
        receipt_file_id: receipt?.id ?? null,
      };
      return expense ? updateExpense(expense.id, payload) : createExpense(tripId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', tripId] });
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard', tripId] });
      toast({ title: expense ? 'Despesa atualizada' : 'Despesa lançada' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) return setError('Escolha a categoria.');
    if (description.trim().length < 2) return setError('Descreva a despesa.');
    if (!parseBRLToCents(planned)) return setError('Informe o valor previsto.');
    setError(null);
    save.mutate();
  };

  const active = categories.data?.filter((c) => c.status === 'ATIVO') ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            {newCategory === null ? (
              <div className="flex gap-2">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger aria-label="Categoria">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {active.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" aria-label="Nova categoria" onClick={() => setNewCategory('')}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input autoFocus aria-label="Nome da nova categoria" placeholder="Nome da categoria" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                <Button type="button" size="icon" aria-label="Criar categoria" disabled={newCategory.trim().length < 2 || addCategory.isPending} onClick={() => addCategory.mutate(newCategory.trim())}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Descrição</Label>
            <Input id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Fretamento do ônibus" />
          </div>
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label htmlFor="exp-supplier">Fornecedor</Label>
              <Input id="exp-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label>Tipo de custo</Label>
              <Select value={costType} onValueChange={(v) => setCostType(v as CostType)}>
                <SelectTrigger aria-label="Tipo de custo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(costTypeLabel) as CostType[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {costTypeLabel[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-planned">Valor previsto (R$)</Label>
              <Input id="exp-planned" inputMode="decimal" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-due">Vencimento</Label>
              <Input id="exp-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          {costType === 'POR_PESSOA' && (
            <p className="text-xs text-muted-foreground">Informe o total desta despesa; o painel divide pelos passageiros para o ponto de equilíbrio.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">Observações</Label>
            <Textarea id="exp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <ReceiptField value={receipt} onChange={setReceipt} />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {expense ? 'Salvar' : 'Lançar despesa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
