import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { allRows, formatCell, type Cell, type Column, type Report, type ReportMeta, type Row } from './model.js';

const ORANGE = '#F47B20';
const INK = '#111821';
const MUTED = '#5b6470';
const LINE = '#dcd6cf';

const when = (d: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);

// ---- PDF (spec 9.2: nome da T4 Trips, viagem, data, filtros, paginação, usuário) ----
// A fonte padrão do PDF (Helvetica, WinAnsi) não tem alguns símbolos; troca
// pelos equivalentes pra não sair "*" no lugar.
const pdfSafe = (t: string) => t.replace(/\u2212/g, '-').replace(/\u00d7/g, 'x');

export function renderPdf(report: Report, meta: ReportMeta): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: report.landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: report.title, Author: 'T4 Trips Manager' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const totalWeight = report.columns.reduce((n, c) => n + (c.width ?? 1), 0);
  const widths = report.columns.map((c) => ((c.width ?? 1) / totalWeight) * width);
  const align = (c: Column) => (c.type === 'money' || c.type === 'int' || c.type === 'percent' ? 'right' : 'left');
  const pad = 4;

  const header = () => {
    doc.rect(left, 36, width, 3).fill(ORANGE);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('T4 TRIPS', left, 46);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(report.title, left, 58, { width });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${meta.tripName} · ${meta.tripSubtitle}`, { width });
    doc.text(`Gerado em ${when(meta.generatedAt)} por ${meta.generatedBy}${meta.filters.length ? ` · Filtros: ${meta.filters.join('; ')}` : ''}`, { width });
    doc.moveDown(0.6);
  };

  const tableHeader = () => {
    const y = doc.y;
    doc.rect(left, y, width, 18).fill('#f3eee8');
    let x = left;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(INK);
    report.columns.forEach((c, i) => {
      doc.text(c.label, x + pad, y + 5, { width: widths[i] - pad * 2, align: align(c), lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + 18;
  };

  const newPage = () => {
    doc.addPage();
    header();
    tableHeader();
  };

  const row = (r: Row, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const texts = report.columns.map((c) => pdfSafe(formatCell(r[c.key] ?? null, c.type)));
    const h = Math.max(...texts.map((t, i) => doc.heightOfString(t, { width: widths[i] - pad * 2 }))) + pad * 2;
    if (doc.y + h > bottom()) newPage();
    const y = doc.y;
    let x = left;
    doc.fillColor(INK);
    texts.forEach((t, i) => {
      doc.text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: align(report.columns[i]) });
      x += widths[i];
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.y = y + h;
  };

  header();
  if (allRows(report).length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Nenhum registro para os filtros escolhidos.', left, doc.y + 10);
  } else if (report.groups) {
    for (const g of report.groups) {
      if (doc.y + 60 > bottom()) {
        doc.addPage();
        header();
      }
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`${g.title} (${g.rows.length})`, left, doc.y + 6, { width });
      doc.moveDown(0.3);
      tableHeader();
      if (g.rows.length === 0) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Ninguém aqui.', left + pad, doc.y + 4);
      g.rows.forEach((r) => row(r));
      doc.moveDown(0.6);
    }
  } else {
    tableHeader();
    report.rows!.forEach((r) => row(r));
  }
  if (report.totals) row(report.totals, true);
  if (report.notes?.length) {
    doc.moveDown(0.8).font('Helvetica').fontSize(8).fillColor(MUTED);
    report.notes.forEach((n) => doc.text(n, left, doc.y, { width }));
  }

  // Rodapé com "Página x de y" em todas as páginas.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - doc.page.margins.bottom - 10;
    doc.font('Helvetica').fontSize(7).fillColor(MUTED);
    doc.text('T4 Trips Manager · documento interno', left, y, { width, align: 'left', lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

// ---- CSV: ";" e vírgula decimal, como o Excel em português espera ----
const csvValue = (v: Cell, c: Column) => {
  if (v === null || v === '') return '';
  if (c.type === 'money') return (Number(v) / 100).toFixed(2).replace('.', ',');
  if (c.type === 'percent') return (Number(v) * 100).toFixed(1).replace('.', ',');
  if (c.type === 'date') return formatCell(v, 'date');
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function renderCsv(report: Report): Buffer {
  const cols = report.groups ? [{ key: '__group', label: 'Grupo' } as Column, ...report.columns] : report.columns;
  const lines = [cols.map((c) => csvValue(c.label, { key: '', label: '' })).join(';')];
  const push = (r: Row, group?: string) => lines.push(cols.map((c) => (c.key === '__group' ? csvValue(group ?? '', c) : csvValue(r[c.key] ?? null, c))).join(';'));
  if (report.groups) report.groups.forEach((g) => g.rows.forEach((r) => push(r, g.title)));
  else report.rows!.forEach((r) => push(r));
  if (report.totals) push(report.totals, '');
  // BOM pra o Excel reconhecer UTF-8 (acentos).
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

// ---- Excel ----
export async function renderXlsx(report: Report, meta: ReportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'T4 Trips Manager';
  wb.created = meta.generatedAt;
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  const cols = report.groups ? [{ key: '__group', label: 'Grupo', width: 1.2 } as Column, ...report.columns] : report.columns;

  ws.addRow([`T4 TRIPS · ${report.title}`]).font = { bold: true, size: 13, color: { argb: 'FFF47B20' } };
  ws.addRow([`${meta.tripName} · ${meta.tripSubtitle}`]);
  ws.addRow([`Gerado em ${when(meta.generatedAt)} por ${meta.generatedBy}`]);
  if (meta.filters.length) ws.addRow([`Filtros: ${meta.filters.join('; ')}`]);
  ws.addRow([]);
  const head = ws.addRow(cols.map((c) => c.label));
  head.font = { bold: true };
  head.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EEE8' } }));
  const headerRow = head.number;

  const value = (v: Cell, c: Column) => {
    if (v === null || v === '') return null;
    if (c.type === 'money') return Number(v) / 100;
    if (c.type === 'date') {
      const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    return v;
  };
  const add = (r: Row, group?: string, bold = false) => {
    const row = ws.addRow(cols.map((c) => (c.key === '__group' ? (group ?? '') : value(r[c.key] ?? null, c))));
    if (bold) row.font = { bold: true };
  };
  if (report.groups) report.groups.forEach((g) => g.rows.forEach((r) => add(r, g.title)));
  else report.rows!.forEach((r) => add(r));
  if (report.totals) add(report.totals, '', true);

  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, Math.round((c.width ?? 1) * 16));
    if (c.type === 'money') col.numFmt = '"R$" #,##0.00';
    if (c.type === 'percent') col.numFmt = '0.0%';
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
