import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createLayout, updateLayout } from '@/lib/vehicles.service';
import { categoryPresets, layoutProblem } from '@/lib/seat-layout';
import type { LayoutData, SeatLayout, VehicleTemplate } from '@/types';
import { Loader2 } from 'lucide-react';
import { LayoutEditor } from './LayoutEditor';

interface Props {
  template: VehicleTemplate | null;
  // Sem layout = novo layout a partir do padrão do veículo.
  layout: SeatLayout | null;
  onOpenChange: (open: boolean) => void;
}

export function LayoutDialog({ template, layout, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [data, setData] = useState<LayoutData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!template) return;
    const base = layout ?? template.layouts.find((l) => l.is_default) ?? template.layouts[0];
    setName(layout ? layout.name : '');
    setData(base ? structuredClone(base.layout_data) : null);
    setError(null);
  }, [template, layout]);

  const mutation = useMutation({
    mutationFn: () =>
      layout ? updateLayout(layout.id, { name: name.trim(), layout_data: data! }) : createLayout(template!.id, { name: name.trim(), layout_data: data!, is_default: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-templates'] });
      toast({ title: layout ? 'Layout salvo' : 'Layout criado' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Informe o nome do layout.');
    const problem = layoutProblem(data!);
    if (problem) return setError(problem);
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{layout ? `Editar layout · ${template?.name}` : `Novo layout · ${template?.name}`}</DialogTitle>
          {layout && (
            <DialogDescription>Viagens que já usam este layout guardaram a própria cópia dos assentos e não mudam.</DialogDescription>
          )}
        </DialogHeader>
        {template && data && (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="layout-name">Nome do layout</Label>
              <Input id="layout-name" placeholder="Ex.: Com poltrona de guia" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <LayoutEditor value={data} onChange={setData} preset={categoryPresets[template.category]} />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar layout
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
