import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { CustomerDetailDialog } from '@/components/customers/CustomerDetailDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { archiveCustomer, listCustomers, restoreCustomer } from '@/lib/customers.service';
import { formatCpf, formatPhone } from '@/lib/format';
import type { Customer } from '@/types';
import { Archive, ArchiveRestore, Pencil, Plus, Search } from 'lucide-react';

const Customers = () => {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ATIVO');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const q = useDebounce(search.trim());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['customers', q, status, page],
    queryFn: () => listCustomers({ q, status, page }),
    placeholderData: keepPreviousData,
  });

  const toggleArchive = useMutation({
    mutationFn: (c: Customer) => (c.status === 'ATIVO' ? archiveCustomer(c.id) : restoreCustomer(c.id)),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: c.status === 'ARQUIVADO' ? 'Cliente arquivado' : 'Cliente restaurado' });
    },
    onError: (err: Error) => toast({ title: 'Ação não concluída', description: err.message, variant: 'destructive' }),
  });

  const canEdit = can('customers.write') && can('sensitive.view');
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const open = (c: Customer | null) => {
    setEditing(c);
    setFormOpen(true);
  };

  const actions = (c: Customer) => (
    <div className="flex justify-end gap-1">
      {canEdit && !c.anonymized_at && (
        <Button variant="ghost" size="icon-sm" onClick={() => open(c)} aria-label={`Editar ${c.full_name}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {can('customers.archive') && !c.anonymized_at && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => toggleArchive.mutate(c)}
          aria-label={c.status === 'ATIVO' ? `Arquivar ${c.full_name}` : `Restaurar ${c.full_name}`}
        >
          {c.status === 'ATIVO' ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={data ? `${data.total} cadastro(s)` : 'Cadastro permanente de clientes'}
        actions={
          can('customers.write') && (
            <Button onClick={() => open(null)}>
              <Plus className="h-4 w-4" /> Novo cliente
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={can('sensitive.view') ? 'Buscar por nome, CPF, telefone ou e-mail' : 'Buscar por nome'}
            aria-label="Buscar clientes"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44" aria-label="Situação do cadastro">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ATIVO">Ativos</SelectItem>
            <SelectItem value="ARQUIVADO">Arquivados</SelectItem>
            <SelectItem value="TODOS">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : isError ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : data!.items.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">
          {q ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}
        </div>
      ) : (
        <>
          {/* Celular: cartões */}
          <div className="space-y-2 md:hidden">
            {data!.items.map((c) => (
              <div key={c.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <button type="button" className="font-medium truncate hover:text-primary text-left" onClick={() => setViewing(c)}>
                    {c.full_name}
                  </button>
                  <p className="text-muted-foreground">{formatPhone(c.whatsapp ?? c.phone)}</p>
                  <p className="text-muted-foreground">{[c.city, c.state].filter(Boolean).join(' / ')}</p>
                  {c.status === 'ARQUIVADO' && <Badge variant="cancelled" className="mt-1">Arquivado</Badge>}
                </div>
                {actions(c)}
              </div>
            ))}
          </div>

          {/* Computador: tabela */}
          <div className="hidden md:block rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <button type="button" className="hover:text-primary text-left" onClick={() => setViewing(c)}>
                        {c.full_name}
                      </button>
                      {c.status === 'ARQUIVADO' && <Badge variant="cancelled" className="ml-2">Arquivado</Badge>}
                    </TableCell>
                    <TableCell>{formatCpf(c.cpf)}</TableCell>
                    <TableCell>{formatPhone(c.whatsapp ?? c.phone)}</TableCell>
                    <TableCell>{c.email ?? '—'}</TableCell>
                    <TableCell>{[c.city, c.state].filter(Boolean).join(' / ') || '—'}</TableCell>
                    <TableCell>{actions(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span>
                {page} de {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      <CustomerDetailDialog customer={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};

export default Customers;
