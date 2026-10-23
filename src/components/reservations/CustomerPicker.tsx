import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/use-debounce';
import { listCustomers } from '@/lib/customers.service';
import { formatPhone } from '@/lib/format';
import type { Customer } from '@/types';
import { Loader2, Search, UserPlus, X } from 'lucide-react';

interface Props {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
}

// Busca o cliente no cadastro permanente; se não existir, cadastra na hora
// (fluxo 13.2) e já seleciona.
export function CustomerPicker({ value, onChange }: Props) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDebounce(search.trim());

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'picker', q],
    queryFn: () => listCustomers({ q }),
    enabled: !value && q.length >= 2,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div className="text-sm">
          <p className="font-medium">{value.full_name}</p>
          <p className="text-muted-foreground">{formatPhone(value.whatsapp ?? value.phone)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label="Trocar cliente">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Buscar cliente pelo nome"
          aria-label="Buscar cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {q.length >= 2 && data && (
        <ul className="rounded-lg border divide-y max-h-56 overflow-y-auto" role="listbox" aria-label="Clientes encontrados">
          {data.items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado.</li>}
          {data.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onChange(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
              >
                <span className="font-medium">{c.full_name}</span>
                <span className="text-muted-foreground"> · {[c.city, c.state].filter(Boolean).join('/') || formatPhone(c.whatsapp ?? c.phone)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {can('customers.write') && (
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" /> Cadastrar novo cliente
        </Button>
      )}

      <CustomerFormDialog open={creating} onOpenChange={setCreating} onSaved={onChange} />
    </div>
  );
}
