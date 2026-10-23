import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createVehicleTemplate, updateVehicleTemplate } from '@/lib/vehicles.service';
import { categoryPresets, generateLayout, layoutProblem } from '@/lib/seat-layout';
import { vehicleCategoryLabel } from '@/lib/constants';
import type { LayoutData, VehicleCategory, VehicleTemplate } from '@/types';
import { Loader2 } from 'lucide-react';
import { LayoutEditor } from './LayoutEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: VehicleTemplate | null;
}

const categories = Object.keys(vehicleCategoryLabel) as VehicleCategory[];

export function VehicleFormDialog({ open, onOpenChange, template }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editing = !!template;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<VehicleCategory>('MICRO_ONIBUS');
  const [code, setCode] = useState('');
  const [aisle, setAisle] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [layout, setLayout] = useState<LayoutData>(generateLayout(categoryPresets.MICRO_ONIBUS));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setCategory(template?.category ?? 'MICRO_ONIBUS');
    setCode(template?.code ?? '');
    setAisle(template?.aisle_config ?? '');
    setDescription(template?.description ?? '');
    setActive(template ? template.status === 'ATIVO' : true);
    setLayout(generateLayout(categoryPresets.MICRO_ONIBUS));
    setError(null);
  }, [open, template]);

  const changeCategory = (c: VehicleCategory) => {
    setCategory(c);
    if (!editing) {
      const p = categoryPresets[c];
      setLayout(generateLayout(p));
      setAisle(`${p.left}+${p.right}`);
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), category, code: code.trim() || null, aisle_config: aisle.trim() || null, description: description.trim() || null };
      return editing
        ? updateVehicleTemplate(template!.id, { ...data, status: active ? 'ATIVO' : 'INATIVO' })
        : createVehicleTemplate({ ...data, layout: { name: 'Padrão', layout_data: layout } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-templates'] });
      toast({ title: editing ? 'Veículo atualizado' : 'Veículo cadastrado' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Informe o nome do veículo.');
    if (!editing) {
      const problem = layoutProblem(layout);
      if (problem) return setError(problem);
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={editing ? 'max-w-lg' : 'max-w-4xl max-h-[92vh] overflow-y-auto'}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="veh-name">Nome</Label>
              <Input id="veh-name" placeholder="Ex.: Micro-ônibus 28 lugares" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => changeCategory(v as VehicleCategory)}>
                <SelectTrigger aria-label="Categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {vehicleCategoryLabel[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-code">Identificação ou código</Label>
              <Input id="veh-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-aisle">Corredor</Label>
              <Input id="veh-aisle" placeholder="2+2" value={aisle} onChange={(e) => setAisle(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="veh-desc">Observações</Label>
              <Textarea id="veh-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {editing && (
              <label className="flex items-center justify-between gap-4 text-sm sm:col-span-2">
                Disponível para novas viagens
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
            )}
          </div>

          {!editing && (
            <div className="space-y-2">
              <p className="font-medium">Layout de assentos</p>
              <LayoutEditor key={category} value={layout} onChange={setLayout} preset={categoryPresets[category]} />
            </div>
          )}

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
              {editing ? 'Salvar' : 'Cadastrar veículo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
