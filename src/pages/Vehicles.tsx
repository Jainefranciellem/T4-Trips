import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleFormDialog } from '@/components/vehicles/VehicleFormDialog';
import { LayoutDialog } from '@/components/vehicles/LayoutDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { duplicateLayout, listVehicleTemplates, updateLayout } from '@/lib/vehicles.service';
import { vehicleCategoryLabel } from '@/lib/constants';
import type { SeatLayout, VehicleTemplate } from '@/types';
import { Copy, Pencil, Plus, Star } from 'lucide-react';

const Vehicles = () => {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const manage = can('vehicles.manage');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleTemplate | null>(null);
  const [layoutFor, setLayoutFor] = useState<{ template: VehicleTemplate; layout: SeatLayout | null } | null>(null);

  const { data, isLoading, isError, error } = useQuery({ queryKey: ['vehicle-templates'], queryFn: listVehicleTemplates });

  const layoutAction = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicle-templates'] }),
    onError: (err: Error) => toast({ title: 'Ação não concluída', description: err.message, variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader
        title="Veículos"
        description="Modelos de veículo e layouts de assentos reutilizados nas viagens"
        actions={
          manage && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo veículo
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : isError ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : data!.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">Nenhum veículo cadastrado ainda.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.map((t) => (
            <Card key={t.id} className={t.status === 'INATIVO' ? 'opacity-70' : undefined}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {vehicleCategoryLabel[t.category]}
                      {t.aisle_config && ` · ${t.aisle_config}`}
                      {t.code && ` · ${t.code}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === 'INATIVO' && <Badge variant="cancelled">Inativo</Badge>}
                    <Badge variant="outline">{t.capacity} lugares</Badge>
                    {manage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${t.name}`}
                        onClick={() => {
                          setEditing(t);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Layouts</p>
                  {t.layouts.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span>
                        {l.name} <span className="text-muted-foreground">· v{l.version}</span>
                        {l.is_default && <Badge variant="attended" className="ml-2">Padrão</Badge>}
                      </span>
                      {manage && (
                        <span className="flex gap-1">
                          {!l.is_default && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Tornar ${l.name} o padrão`} onClick={() => layoutAction.mutate(() => updateLayout(l.id, { is_default: true }))}>
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" aria-label={`Duplicar ${l.name}`} onClick={() => layoutAction.mutate(() => duplicateLayout(l.id))}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${l.name}`} onClick={() => setLayoutFor({ template: t, layout: l })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </span>
                      )}
                    </div>
                  ))}
                  {manage && (
                    <Button variant="outline" size="sm" onClick={() => setLayoutFor({ template: t, layout: null })}>
                      <Plus className="h-4 w-4" /> Novo layout
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VehicleFormDialog open={formOpen} onOpenChange={setFormOpen} template={editing} />
      <LayoutDialog template={layoutFor?.template ?? null} layout={layoutFor?.layout ?? null} onOpenChange={(o) => !o && setLayoutFor(null)} />
    </div>
  );
};

export default Vehicles;
