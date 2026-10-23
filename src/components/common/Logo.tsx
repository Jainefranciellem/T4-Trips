import { cn } from '@/lib/utils';

// Marca provisória em texto até a T4 Trips mandar o logo em arquivo.
export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-ocean">
        <span className="text-primary-foreground font-black text-lg tracking-tight">T4</span>
      </div>
      <div className="leading-tight">
        <p className="font-bold tracking-wide">T4 TRIPS</p>
        {subtitle && <p className="text-xs opacity-70">Manager</p>}
      </div>
    </div>
  );
}
