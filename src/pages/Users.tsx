import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { useAuth } from '@/contexts/AuthContext';
import { listUsers } from '@/lib/users.service';
import { roleLabel } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { ManagedUser } from '@/types';
import { Pencil, Plus } from 'lucide-react';

const Users = () => {
  const { can } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const allowed = can('users.manage');
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: allowed });

  if (!allowed) return <Navigate to="/viagens" replace />;

  const open = (u: ManagedUser | null) => {
    setEditing(u);
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Equipe com acesso à área administrativa"
        actions={
          <Button onClick={() => open(null)}>
            <Plus className="h-4 w-4" /> Novo usuário
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : isError ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead className="hidden sm:table-cell">Último acesso</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">{roleLabel[u.role]}</Badge>
                      {u.status === 'INATIVO' && <Badge variant="cancelled">Inativo</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {u.last_login_at ? formatDateTime(u.last_login_at) : 'Nunca'}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" onClick={() => open(u)} aria-label={`Editar ${u.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
    </div>
  );
};

export default Users;
