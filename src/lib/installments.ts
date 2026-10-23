// Mesma divisão do backend (finance-rules.ts): parcelas iguais, centavos que
// sobram nas primeiras, vencimento mensal.
export function splitInstallments(total: number, count: number, firstDue: string) {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  const [y, m, d] = firstDue.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const month = m - 1 + i;
    const lastDay = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(y, month, Math.min(d, lastDay)));
    return { installment_number: i + 1, due_date: due.toISOString().slice(0, 10), amount: base + (i < rest ? 1 : 0) };
  });
}
