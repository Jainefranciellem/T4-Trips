import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}

// Filtro em botões com o visual das abas. Diferente de <Tabs>, não aponta pra
// um painel (aria-controls), então leitores de tela não procuram um que não existe.
export function Segmented<T extends string>({ label, value, options, onChange, className }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex h-10 items-center rounded-md bg-muted p-1 text-muted-foreground overflow-x-auto max-w-full', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
