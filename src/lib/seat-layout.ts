import type { LayoutData, LayoutSeat, VehicleCategory } from '@/types';

export interface LayoutPreset {
  // Lugares à esquerda e à direita do corredor, ex.: 2+2.
  left: number;
  right: number;
  // Fileiras por andar (1 ou 2 andares).
  rows: number[];
  // Última fileira ocupa também o corredor (ônibus com 5 no fundo).
  fullBackRow: boolean;
}

// Pontos de partida por categoria; o editor ajusta depois.
export const categoryPresets: Record<VehicleCategory, LayoutPreset> = {
  VAN: { left: 2, right: 1, rows: [5], fullBackRow: false },
  MICRO_ONIBUS: { left: 2, right: 2, rows: [7], fullBackRow: false },
  ONIBUS_CONVENCIONAL: { left: 2, right: 2, rows: [11], fullBackRow: true },
  ONIBUS_EXECUTIVO: { left: 2, right: 2, rows: [11], fullBackRow: false },
  ONIBUS_LD: { left: 2, right: 2, rows: [3, 12], fullBackRow: false },
  ONIBUS_LDD: { left: 2, right: 1, rows: [4, 12], fullBackRow: false },
  PERSONALIZADO: { left: 2, right: 2, rows: [10], fullBackRow: false },
};

const seat = (floor: number, row: number, col: number, number: number): LayoutSeat => ({
  floor,
  row,
  col,
  number: String(number),
  type: 'NORMAL',
  accessible: false,
  blocked: false,
});

// Gera a grade com corredor na coluna `left` e numera da frente para o fundo,
// da esquerda para a direita, continuando do térreo para o andar de cima.
export function generateLayout({ left, right, rows, fullBackRow }: LayoutPreset): LayoutData {
  const cols = left + 1 + right;
  const seats: LayoutSeat[] = [];
  let n = 1;
  rows.forEach((rowCount, i) => {
    const floor = i + 1;
    for (let r = 0; r < rowCount; r++) {
      const isBack = fullBackRow && r === rowCount - 1 && i === rows.length - 1;
      for (let c = 0; c < cols; c++) {
        if (c === left && !isBack) continue;
        seats.push(seat(floor, r, c, n++));
      }
    }
  });
  return { floors: rows.map((rowCount, i) => ({ floor: i + 1, rows: rowCount, cols })), seats };
}

const byPosition = (a: LayoutSeat, b: LayoutSeat) => a.floor - b.floor || a.row - b.row || a.col - b.col;

// Renumera 1..N na ordem da grade, mantendo tipo e bloqueios.
export function renumber(layout: LayoutData): LayoutData {
  const seats = [...layout.seats].sort(byPosition).map((s, i) => ({ ...s, number: String(i + 1) }));
  return { ...layout, seats };
}

export function nextSeatNumber(layout: LayoutData): string {
  const used = new Set(layout.seats.map((s) => s.number.toUpperCase()));
  let n = layout.seats.length + 1;
  for (let i = 1; i <= layout.seats.length + 1; i++) {
    if (!used.has(String(i))) {
      n = i;
      break;
    }
  }
  return String(n);
}

// Mesmas checagens do backend, pra avisar antes de salvar.
export function layoutProblem(layout: LayoutData): string | null {
  if (layout.seats.length === 0) return 'O layout precisa de pelo menos um assento.';
  const seen = new Set<string>();
  for (const s of layout.seats) {
    if (!s.number.trim()) return 'Há assento sem número.';
    const key = s.number.trim().toUpperCase();
    if (seen.has(key)) return `Número de assento repetido: ${s.number}.`;
    seen.add(key);
    const f = layout.floors.find((fl) => fl.floor === s.floor);
    if (!f || s.row >= f.rows || s.col >= f.cols) return `O assento ${s.number} ficou fora da grade.`;
  }
  return null;
}

export const layoutCapacity = (layout: LayoutData) => layout.seats.filter((s) => !s.blocked).length;
export const compareSeatNumbers = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
