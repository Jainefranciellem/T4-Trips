import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getTripUsers, listUserOptions, setTripUsers } from '@/lib/trips.service';
import { roleLabel } from '@/lib/constants';
import { Loader2 } from 'lucide-react';

type Level = 'VISUALIZAR' | 'OPERAR';

// Quem, além dos administradores, enxerga esta viagem (spec 6.9).
export function TripAccessCard({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const options = useQuery({ queryKey: ['user-options'], queryFn: listUserOptions });
  const access = useQuery({ queryKey: ['trip', tripId, 'users'], queryFn: () => getTripUsers(tripId) });
  const [selected, setSelected] = useState<Record<string, Level>>({});

  useEffect(() => {
    if (access.data) setSelected(Object.fromEntries(access.data.map((a) => [a.user_id, a.access_level])));
  }, [access.data]);

  const save = useMutation({
    mutationFn: () =>
      setTripUsers(
        tripId,
        Object.entries(selected).map(([user_id, access_level]) => ({ user_id, access_level })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId, 'users'] });
      toast({ title: 'Acessos atualizados' });
    },
    onError: (err: Error) => toast({ title: 'Não foi possível salvar', description: err.message, variant: 'destructive' }),
  });

  const users = options.data?.filter((u) => u.role !== 'ADMIN') ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Equipe com acesso</CardTitle>
        <CardDescription>Administradores veem todas as viagens. Marque quem mais pode acessar esta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.isLoading || access.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário além dos administradores. Cadastre em Usuários.</p>
        ) : (
          users.map((u) => {
            const checked = u.id in selected;
            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const next = { ...s };
                        if (v) next[u.id] = 'OPERAR';
                        else delete next[u.id];
                        return next;
                      })
                    }
                  />
                  {u.name} <span className="text-muted-foreground">· {roleLabel[u.role]}</span>
                </label>
                {checked && (
                  <Select value={selected[u.id]} onValueChange={(v) => setSelected((s) => ({ ...s, [u.id]: v as Level }))}>
                    <SelectTrigger className="w-36 h-8" aria-label={`Nível de acesso de ${u.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPERAR">Operar</SelectItem>
                      <SelectItem value="VISUALIZAR">Só visualizar</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })
        )}
        {users.length > 0 && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar acessos
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
