import { apiFetch, apiFetchFile } from './api';

export type ReportFilter = 'status' | 'vehicle' | 'accommodation' | 'period' | 'internal';
export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ReportInfo {
  slug: string;
  title: string;
  description: string;
  financial: boolean;
  filters: ReportFilter[];
}

export interface ReportCatalog {
  reports: ReportInfo[];
  options: { vehicles: { id: string; name: string }[]; accommodations: { id: string; name: string }[] };
}

export const listReports = (tripId: string) => apiFetch<ReportCatalog>(`/trips/${tripId}/reports`);

// PDF abre numa aba; CSV e Excel baixam.
export async function getReport(tripId: string, slug: string, format: ReportFormat, params: Record<string, string> = {}) {
  // A aba abre antes da espera pra o navegador não bloquear como pop-up.
  const win = format === 'pdf' ? window.open('', '_blank') : null;
  try {
    const qs = new URLSearchParams({ format, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) });
    const { blob, filename } = await apiFetchFile(`/trips/${tripId}/reports/${slug}?${qs}`);
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
