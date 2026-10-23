import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createUser, updateUser } from '@/lib/users.service';
import { roleDescription, roleLabel } from '@/lib/constants';
import type { ManagedUser, Role } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: ManagedUser | null;
}

const roles = Object.keys(roleLabel) as Role[];

export function UserFormDialog({ open, onOpenChange, user }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('OPERADOR');
  const [active, setActive] = useState(true);
  const [sensitive, setSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setRole(user?.role ?? 'OPERADOR');
    setActive(user ? user.status === 'ATIVO' : true);
    setSensitive(user?.can_view_sensitive ?? false);
    setError(null);
  }, [open, user]);

  const mutation = useMutation({
    mutationFn: () =>
      user
        ? updateUser(user.id, {
            name,
            role,
            status: active ? 'ATIVO' : 'INATIVO',
            can_view_sensitive: sensitive,
            ...(password ? { password } : {}),
          })
        : createUser({ name, email, password, role, can_view_sensitive: sensitive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: user ? 'Usuário atualizado' : 'Usuário criado' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Informe o nome.');
    if (!user && !email.includes('@')) return setError('Informe um e-mail válido.');
    if ((!user || password) && password.length < 8) return setError('A senha deve ter ao menos 8 caracteres.');
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Nome</Label>
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-email">E-mail</Label>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-password">{user ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial'}</Label>
            <Input id="user-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger aria-label="Perfil">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{roleDescription[role]}</p>
          </div>
          {role === 'VISUALIZADOR' && (
            <label className="flex items-center justify-between gap-4 text-sm">
              Pode ver CPF e contatos dos clientes
              <Switch checked={sensitive} onCheckedChange={setSensitive} />
            </label>
          )}
          {user && (
            <label className="flex items-center justify-between gap-4 text-sm">
              Usuário ativo
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
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
              {user ? 'Salvar' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
