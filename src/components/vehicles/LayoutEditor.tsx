import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { generateLayout, layoutCapacity, nextSeatNumber, renumber, type LayoutPreset } from '@/lib/seat-layout';
import { seatTypeLabel } from '@/lib/constants';
import type { LayoutData, LayoutSeat, SeatType } from '@/types';
import { Accessibility, Ban, ListOrdered, Trash2, Wand2 } from 'lucide-react';
import { SeatGrid } from './SeatGrid';

interface Props {
  value: LayoutData;
  onChange: (layout: LayoutData) => void;
  preset: LayoutPreset;
}

const key = (s: Pick<LayoutSeat, 'floor' | 'row' | 'col'>) => `${s.floor}:${s.row}:${s.col}`;

// Editor simples (spec RF-007): gera a grade por padrão de corredor e permite
// adicionar/remover assentos, mudar número, tipo, acessibilidade e bloqueio.
export function LayoutEditor({ value, onChange, preset: initialPreset }: Props) {
  const [preset, setPreset] = useState<LayoutPreset>(initialPreset);
  const [selected, setSelected] = useState<string | null>(null);

  const seatAt = new Map(value.seats.map((s) => [key(s), s]));
  const current = selected ? seatAt.get(selected) : undefined;

  const updateSeat = (patch: Partial<LayoutSeat>) => {
    if (!current) return;
    onChange({ ...value, seats: value.seats.map((s) => (key(s) === selected ? { ...s, ...patch } : s)) });
  };

  const setFloorSize = (floor: number, patch: { rows?: number; cols?: number }) => {
    const floors = value.floors.map((f) => (f.floor === floor ? { ...f, ...patch } : f));
    const fit = (s: LayoutSeat) => {
      const f = floors.find((fl) => fl.floor === s.floor)!;
      return s.row < f.rows && s.col < f.cols;
    };
    onChange({ floors, seats: value.seats.filter(fit) });
  };

  const regenerate = () => {
    setSelected(null);
    onChange(generateLayout(preset));
  };

  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-3">
        <p className="text-sm font-medium">Gerar a partir de um padrão</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="pl-left" className="text-xs">Lugares à esquerda</Label>
            <Input id="pl-left" type="number" min={1} max={3} className="w-20" value={preset.left} onChange={(e) => setPreset({ ...preset, left: num(e.target.value, 1, 3) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pl-right" className="text-xs">À direita</Label>
            <Input id="pl-right" type="number" min={1} max={3} className="w-20" value={preset.right} onChange={(e) => setPreset({ ...preset, right: num(e.target.value, 1, 3) })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Andares</Label>
            <Select
              value={String(preset.rows.length)}
              onValueChange={(v) => setPreset({ ...preset, rows: v === '2' ? [preset.rows[0], preset.rows[1] ?? preset.rows[0]] : [preset.rows[0]] })}
            >
              <SelectTrigger className="w-20" aria-label="Andares">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset.rows.map((r, i) => (
            <div key={i} className="space-y-1">
              <Label htmlFor={`pl-rows-${i}`} className="text-xs">Fileiras{preset.rows.length > 1 ? (i === 0 ? ' (baixo)' : ' (cima)') : ''}</Label>
              <Input
                id={`pl-rows-${i}`}
                type="number"
                min={1}
                max={20}
                className="w-20"
                value={r}
                onChange={(e) => setPreset({ ...preset, rows: preset.rows.map((x, j) => (j === i ? num(e.target.value, 1, 20) : x)) })}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs pb-2">
            <Switch checked={preset.fullBackRow} onCheckedChange={(v) => setPreset({ ...preset, fullBackRow: v })} />
            Fundo com fileira inteira
          </label>
          <Button type="button" variant="outline" size="sm" onClick={regenerate}>
            <Wand2 className="h-4 w-4" /> Gerar grade
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <strong>{layoutCapacity(value)}</strong> lugares · {value.seats.length} assentos no total
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(renumber(value))}>
          <ListOrdered className="h-4 w-4" /> Renumerar em ordem
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Clique num espaço vazio para criar um assento, ou num assento para editar.</p>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex flex-wrap gap-4 overflow-x-auto">
          {value.floors.map((floor) => (
            <div key={floor.floor} className="space-y-2">
              <SeatGrid
                floor={floor}
                showFloorLabel={value.floors.length > 1}
                onEmptyClick={(row, col) => {
                  const s: LayoutSeat = { floor: floor.floor, row, col, number: nextSeatNumber(value), type: 'NORMAL', accessible: false, blocked: false };
                  onChange({ ...value, seats: [...value.seats, s] });
                  setSelected(key(s));
                }}
                renderCell={(row, col) => {
                  const s = seatAt.get(key({ floor: floor.floor, row, col }));
                  if (!s) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => setSelected(key(s))}
                      aria-label={`Assento ${s.number}${s.blocked ? ', bloqueado' : ''}`}
                      aria-pressed={selected === key(s)}
                      className={cn(
                        'relative h-10 w-10 rounded-md border text-xs font-semibold transition-colors',
                        s.blocked ? 'bg-muted text-muted-foreground line-through' : 'bg-background hover:border-primary',
                        selected === key(s) && 'ring-2 ring-primary ring-offset-1',
                      )}
                    >
                      {s.number}
                      {s.accessible && <Accessibility className="absolute -top-1 -right-1 h-3.5 w-3.5 text-primary bg-background rounded-full" aria-hidden />}
                    </button>
                  );
                }}
              />
              <div className="flex gap-2">
                <Input aria-label="Fileiras" type="number" min={1} max={40} className="w-20 h-8" value={floor.rows} onChange={(e) => setFloorSize(floor.floor, { rows: num(e.target.value, 1, 40) })} />
                <Input aria-label="Colunas" type="number" min={1} max={8} className="w-20 h-8" value={floor.cols} onChange={(e) => setFloorSize(floor.floor, { cols: num(e.target.value, 1, 8) })} />
                <span className="text-xs text-muted-foreground self-center">fileiras × colunas</span>
              </div>
            </div>
          ))}
        </div>

        {current && (
          <div className="rounded-lg border p-4 space-y-3 md:w-60 shrink-0">
            <p className="font-medium text-sm">Assento {current.number}</p>
            <div className="space-y-1">
              <Label htmlFor="seat-number" className="text-xs">Número</Label>
              <Input id="seat-number" value={current.number} maxLength={6} onChange={(e) => updateSeat({ number: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={current.type} onValueChange={(v) => updateSeat({ type: v as SeatType })}>
                <SelectTrigger aria-label="Tipo do assento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(seatTypeLabel) as SeatType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {seatTypeLabel[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1"><Accessibility className="h-4 w-4" /> Acessível</span>
              <Switch checked={current.accessible} onCheckedChange={(v) => updateSeat({ accessible: v })} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1"><Ban className="h-4 w-4" /> Bloqueado</span>
              <Switch checked={current.blocked} onCheckedChange={(v) => updateSeat({ blocked: v })} />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-destructive"
              onClick={() => {
                onChange({ ...value, seats: value.seats.filter((s) => key(s) !== selected) });
                setSelected(null);
              }}
            >
              <Trash2 className="h-4 w-4" /> Remover assento
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
