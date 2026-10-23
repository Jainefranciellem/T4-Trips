const escape = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface PrintTable {
  title: string;
  subtitle: string;
  generatedBy?: string;
  headers: string[];
  rows: (string | number | null)[][];
}

// Lista simples pra imprimir ou salvar em PDF pelo navegador. Os PDFs
// completos dos relatórios (spec 9.2) vêm na fase de relatórios.
export function printTable({ title, subtitle, generatedBy, headers, rows }: PrintTable) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const now = new Date().toLocaleString('pt-BR');
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111821; }
  header { border-bottom: 3px solid #F47B20; padding-bottom: 8px; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0; } p { margin: 2px 0; font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { background: #f6f3ef; }
  tr { break-inside: avoid; }
</style></head><body>
<header><p><strong>T4 TRIPS</strong></p><h1>${escape(title)}</h1><p>${escape(subtitle)}</p>
<p>Gerado em ${escape(now)}${generatedBy ? ` por ${escape(generatedBy)}` : ''}</p></header>
<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>window.onload = () => window.print();</script></body></html>`);
  win.document.close();
  return true;
}
