import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LayoutFloor } from '@/types';

interface Props {
  floor: LayoutFloor;
  showFloorLabel: boolean;
  // Conteúdo de cada posição ocupada por assento, indexado por "linha:coluna".
  renderCell: (row: number, col: number) => ReactNode | null;
  // No editor, clicar no vazio cria assento.
  onEmptyClick?: (row: number, col: number) => void;
}

// Grade do veículo vista de cima, frente para o alto.
export function SeatGrid({ floor, showFloorLabel, renderCell, onEmptyClick }: Props) {
  return (
    <div className="inline-block">
      {showFloorLabel && <p className="text-xs font-medium text-muted-foreground mb-1">{floor.floor === 1 ? 'Andar de baixo' : 'Andar de cima'}</p>}
      <div className="rounded-t-[2rem] rounded-b-xl border-2 border-foreground/20 bg-card p-3 pt-2">
        <p className="text-[10px] uppercase tracking-wider text-center text-muted-foreground mb-2">Frente</p>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${floor.cols}, 2.5rem)` }}>
          {Array.from({ length: floor.rows * floor.cols }, (_, i) => {
            const row = Math.floor(i / floor.cols);
            const col = i % floor.cols;
            const cell = renderCell(row, col);
            if (cell) return <div key={i}>{cell}</div>;
            return onEmptyClick ? (
              <button
                key={i}
                type="button"
                onClick={() => onEmptyClick(row, col)}
                className={cn('h-10 w-10 rounded-md border border-dashed border-transparent hover:border-muted-foreground/50')}
                aria-label={`Adicionar assento na fileira ${row + 1}, coluna ${col + 1}`}
              />
            ) : (
              <div key={i} className="h-10 w-10" aria-hidden />
            );
          })}
        </div>
      </div>
    </div>
  );
}
