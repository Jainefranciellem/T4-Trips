// Um relatório é uma tabela (com grupos opcionais) que vira PDF, CSV ou Excel
// pelos renderizadores de render.ts. As definições ficam em definitions.ts.

export type ColumnType = 'text' | 'money' | 'int' | 'date' | 'percent' | 'check';

export interface Column {
  key: string;
  label: string;
  type?: ColumnType;
  // Peso da largura no PDF (padrão 1).
  width?: number;
}

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface Group {
  title: string;
  rows: Row[];
}

export interface Report {
  title: string;
  columns: Column[];
  // Ou linhas soltas, ou grupos com título (ex.: por veículo, por pousada).
  rows?: Row[];
  groups?: Group[];
  // Linha de total no fim (mesmas chaves das colunas).
  totals?: Row;
  // Texto curto abaixo da tabela.
  notes?: string[];
  // Paisagem para tabelas largas.
  landscape?: boolean;
}

export interface ReportMeta {
  tripName: string;
  tripSubtitle: string;
  generatedBy: string;
  generatedAt: Date;
  // Filtros aplicados, já em texto (spec 9.2).
  filters: string[];
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Texto de uma célula para PDF/CSV. Dinheiro chega em centavos.
export function formatCell(value: Cell, type: ColumnType = 'text'): string {
  if (value === null || value === '') return type === 'check' ? '[   ]' : '—';
  switch (type) {
    case 'money':
      return brl.format(Number(value) / 100);
    case 'percent':
      return `${(Number(value) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    case 'date': {
      const [y, m, d] = String(value).slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    case 'int':
      return Number(value).toLocaleString('pt-BR');
    default:
      return String(value);
  }
}

export const allRows = (r: Report): Row[] => r.rows ?? (r.groups ?? []).flatMap((g) => g.rows);

// Nome de arquivo seguro: "lista-por-assento-itacare-2027.pdf".
export function fileName(slug: string, tripName: string, ext: string) {
  const base = `${slug}-${tripName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base}.${ext}`;
}
