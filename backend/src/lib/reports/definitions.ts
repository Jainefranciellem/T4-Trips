import type { PrismaClient, ReservationStatus, Trip } from '@prisma/client';
import type { AuthUser } from '../../middleware/auth.js';
import { hasPermission } from '../permissions.js';
import { maskCpf } from '../cpf.js';
import { isEnded } from '../reservation-rules.js';
import { compareSeatNumbers } from '../seat-rules.js';
import { roomCapacity } from '../room-rules.js';
import { dateISO, expenseFinance, tripFinance, type FinancialStatus, type ExpenseStatus } from '../finance-rules.js';
import { financeOf } from '../../routes/finance.routes.js';
import { activeRoomInclude, activeSeatInclude } from '../../routes/reservations.routes.js';
import type { Group, Report, Row } from './model.js';

export interface ReportContext {
  prisma: PrismaClient;
  trip: Trip;
  user: AuthUser;
  query: Record<string, string | undefined>;
}

export interface ReportDefinition {
  slug: string;
  title: string;
  description: string;
  // Exige reports.financial (Admin e Financeiro).
  financial: boolean;
  // Filtros aceitos, pra tela montar os controles.
  filters?: ('status' | 'vehicle' | 'accommodation' | 'period' | 'internal')[];
  build(ctx: ReportContext): Promise<{ report: Report; filters: string[] }>;
}

const reservationLabel: Record<ReservationStatus, string> = {
  PRE_RESERVA: 'Pré-reserva',
  RESERVADA: 'Reservada',
  CONFIRMADA: 'Confirmada',
  PARCIALMENTE_PAGA: 'Parcialmente paga',
  PAGA: 'Paga',
  ATRASADA: 'Atrasada',
  CANCELADA: 'Cancelada',
  REEMBOLSADA: 'Reembolsada',
  LISTA_ESPERA: 'Lista de espera',
};
const financialLabel: Record<FinancialStatus, string> = {
  PENDENTE: 'Pendente',
  PARCIALMENTE_PAGO: 'Parcialmente pago',
  PAGO: 'Pago',
  ATRASADO: 'Atrasado',
  CANCELADO: 'Cancelado',
  REEMBOLSADO: 'Reembolsado',
};
const expenseLabel: Record<ExpenseStatus, string> = {
  PREVISTA: 'Prevista',
  PARCIALMENTE_PAGA: 'Parcialmente paga',
  QUITADA: 'Quitada',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
};
const methodLabel: Record<string, string> = { PIX: 'Pix', DINHEIRO: 'Dinheiro', CARTAO: 'Cartão', TRANSFERENCIA: 'Transferência', OUTRO: 'Outro' };
const roomTypeLabel: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  CASAL: 'Casal',
  DUPLO: 'Duplo',
  TRIPLO: 'Triplo',
  QUADRUPLO: 'Quádruplo',
  QUINTUPLO: 'Quíntuplo',
  SEXTUPLO: 'Sêxtuplo',
  PERSONALIZADO: 'Personalizado',
};

const formatCpf = (d: string) => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d);
const phone = (v: string | null) => {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return v;
};

// ---- dados ----

async function loadReservations(ctx: ReportContext) {
  return ctx.prisma.reservation.findMany({
    where: { trip_id: ctx.trip.id },
    include: {
      customer: true,
      seat_assignments: activeSeatInclude,
      room_assignments: activeRoomInclude,
      payments: true,
      payment_plan: { include: { installments: true } },
    },
    orderBy: { passenger_name: 'asc' },
  });
}
type Res = Awaited<ReturnType<typeof loadReservations>>[number];

const isTraveling = (r: Res) => !isEnded(r.reservation_status) && r.reservation_status !== 'LISTA_ESPERA';
const seatOf = (r: Res) => r.seat_assignments[0]?.trip_seat ?? null;
const roomOf = (r: Res) => r.room_assignments[0]?.trip_room ?? null;

// Filtro de situação das listas de passageiros.
const statusFilters: Record<string, { label: string; test: (r: Res) => boolean }> = {
  ativos: { label: 'Passageiros ativos', test: isTraveling },
  confirmados: { label: 'Só confirmados', test: (r) => isTraveling(r) && !['PRE_RESERVA', 'RESERVADA'].includes(r.reservation_status) },
  lista_espera: { label: 'Lista de espera', test: (r) => r.reservation_status === 'LISTA_ESPERA' },
  cancelados: { label: 'Canceladas', test: (r) => isEnded(r.reservation_status) },
  todos: { label: 'Todas as reservas', test: () => true },
};

function pickStatus(ctx: ReportContext, rows: Res[], fallback = 'ativos') {
  const key = ctx.query.status && statusFilters[ctx.query.status] ? ctx.query.status : fallback;
  return { list: rows.filter(statusFilters[key].test), label: statusFilters[key].label };
}

async function loadVehicles(ctx: ReportContext) {
  return ctx.prisma.tripVehicle.findMany({
    where: { trip_id: ctx.trip.id, ...(ctx.query.vehicle_id ? { id: ctx.query.vehicle_id } : {}) },
    include: { seats: { include: { assignments: { where: { removed_at: null }, include: { reservation: { include: { customer: true } } } } } } },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
  });
}

async function vehicleFilter(ctx: ReportContext) {
  if (!ctx.query.vehicle_id) return [];
  const v = await ctx.prisma.tripVehicle.findFirst({ where: { id: ctx.query.vehicle_id, trip_id: ctx.trip.id } });
  return v ? [`Veículo: ${v.operational_name}`] : [];
}

async function loadAccommodations(ctx: ReportContext) {
  return ctx.prisma.tripAccommodation.findMany({
    where: { trip_id: ctx.trip.id, ...(ctx.query.accommodation_id ? { id: ctx.query.accommodation_id } : {}) },
    include: {
      accommodation: true,
      rooms: { include: { accommodation_room: true, assignments: { where: { removed_at: null }, include: { reservation: true } } } },
    },
    orderBy: { created_at: 'asc' },
  });
}

async function accommodationFilter(ctx: ReportContext) {
  if (!ctx.query.accommodation_id) return [];
  const a = await ctx.prisma.tripAccommodation.findFirst({ where: { id: ctx.query.accommodation_id, trip_id: ctx.trip.id }, include: { accommodation: true } });
  return a ? [`Pousada: ${a.accommodation.name}`] : [];
}

const byIdentifier = (a: { accommodation_room: { identifier: string } }, b: { accommodation_room: { identifier: string } }) =>
  compareSeatNumbers(a.accommodation_room.identifier, b.accommodation_room.identifier);

// ---- relatórios (RF-022) ----

export const reportDefinitions: ReportDefinition[] = [
  {
    slug: 'passageiros',
    title: 'Lista geral de passageiros',
    description: 'Todos os passageiros com situação, assento e quarto.',
    financial: false,
    filters: ['status'],
    async build(ctx) {
      const { list, label } = pickStatus(ctx, await loadReservations(ctx));
      const sensitive = hasPermission(ctx.user, 'sensitive.view');
      const finance = hasPermission(ctx.user, 'finance.read');
      const columns = [
        { key: 'n', label: '#', type: 'int' as const, width: 0.35 },
        { key: 'name', label: 'Passageiro', width: 2 },
        ...(sensitive ? [{ key: 'cpf', label: 'CPF', width: 1.1 }, { key: 'phone', label: 'WhatsApp', width: 1.1 }] : []),
        { key: 'status', label: 'Reserva', width: 1 },
        ...(finance ? [{ key: 'finance', label: 'Pagamento', width: 1 }] : []),
        { key: 'seat', label: 'Assento', width: 1.1 },
        { key: 'room', label: 'Quarto', width: 1.3 },
      ];
      const rows = list.map((r, i) => {
        const seat = seatOf(r);
        const room = roomOf(r);
        return {
          n: i + 1,
          name: r.passenger_name,
          cpf: r.customer.cpf ? formatCpf(r.customer.cpf) : null,
          phone: phone(r.customer.whatsapp ?? r.customer.phone),
          status: reservationLabel[r.reservation_status],
          finance: financialLabel[financeOf(r).status],
          seat: seat ? `${seat.seat_number} · ${seat.trip_vehicle.operational_name}` : null,
          room: room ? `${room.accommodation_room.identifier} · ${room.trip_accommodation.accommodation.name}` : null,
        };
      });
      return { report: { title: this.title, columns, rows, landscape: true, notes: [`${rows.length} passageiro(s).`] }, filters: [label] };
    },
  },
  {
    slug: 'por-veiculo',
    title: 'Lista por veículo',
    description: 'Passageiros agrupados por veículo, com quem ainda está sem assento.',
    financial: false,
    filters: ['vehicle'],
    async build(ctx) {
      const vehicles = await loadVehicles(ctx);
      const groups: Group[] = vehicles.map((v) => ({
        title: `${v.operational_name}${v.identifier ? ` (${v.identifier})` : ''}${v.driver_name ? ` · motorista ${v.driver_name}` : ''}`,
        rows: v.seats
          .filter((s) => s.assignments[0])
          .sort((a, b) => compareSeatNumbers(a.seat_number, b.seat_number))
          .map((s) => ({ seat: s.seat_number, name: s.assignments[0].reservation.passenger_name, status: reservationLabel[s.assignments[0].reservation.reservation_status] })),
      }));
      if (!ctx.query.vehicle_id) {
        const unseated = (await loadReservations(ctx)).filter((r) => isTraveling(r) && !seatOf(r));
        if (unseated.length) groups.push({ title: 'Sem assento', rows: unseated.map((r) => ({ seat: null, name: r.passenger_name, status: reservationLabel[r.reservation_status] })) });
      }
      return {
        report: { title: this.title, columns: [{ key: 'seat', label: 'Assento', width: 0.6 }, { key: 'name', label: 'Passageiro', width: 3 }, { key: 'status', label: 'Reserva', width: 1.2 }], groups },
        filters: await vehicleFilter(ctx),
      };
    },
  },
  {
    slug: 'por-assento',
    title: 'Lista por assento',
    description: 'Mapa em lista: veículo, assento e passageiro, em ordem numérica.',
    financial: false,
    filters: ['vehicle'],
    async build(ctx) {
      const vehicles = await loadVehicles(ctx);
      const rows: Row[] = vehicles.flatMap((v) =>
        v.seats
          .sort((a, b) => compareSeatNumbers(a.seat_number, b.seat_number))
          .map((s) => ({
            vehicle: v.operational_name,
            seat: s.seat_number,
            name: s.assignments[0]?.reservation.passenger_name ?? (s.status === 'BLOQUEADO' ? `(bloqueado${s.blocked_reason ? `: ${s.blocked_reason}` : ''})` : '(livre)'),
          })),
      );
      return {
        report: { title: this.title, columns: [{ key: 'vehicle', label: 'Veículo', width: 1.5 }, { key: 'seat', label: 'Assento', width: 0.6 }, { key: 'name', label: 'Passageiro', width: 3 }], rows },
        filters: await vehicleFilter(ctx),
      };
    },
  },
  {
    slug: 'embarque',
    title: 'Lista de embarque',
    description: 'Para conferir no embarque: assento, nome, documento e campo para marcar.',
    financial: false,
    filters: ['vehicle'],
    async build(ctx) {
      const vehicles = await loadVehicles(ctx);
      // Documento mascarado sempre: lista impressa não leva CPF inteiro (spec 10.2).
      const groups: Group[] = vehicles.map((v) => ({
        title: `${v.operational_name}${v.identifier ? ` (${v.identifier})` : ''}`,
        rows: v.seats
          .filter((s) => s.assignments[0])
          .sort((a, b) => compareSeatNumbers(a.seat_number, b.seat_number))
          .map((s) => {
            const r = s.assignments[0].reservation;
            return { seat: s.seat_number, name: r.passenger_name, doc: maskCpf(r.customer.cpf), minor: r.customer.guardian_name ? 'Sim' : null, check: null };
          }),
      }));
      return {
        report: {
          title: this.title,
          columns: [
            { key: 'seat', label: 'Assento', width: 0.6 },
            { key: 'name', label: 'Passageiro', width: 2.6 },
            { key: 'doc', label: 'Documento', width: 1.1 },
            { key: 'minor', label: 'Menor', width: 0.6 },
            { key: 'check', label: 'Embarcou', type: 'check', width: 0.8 },
          ],
          groups,
          notes: [`Saída: ${ctx.trip.departure_location}.`],
        },
        filters: await vehicleFilter(ctx),
      };
    },
  },
  {
    slug: 'por-pousada',
    title: 'Lista por pousada',
    description: 'Hóspedes agrupados por pousada e quarto.',
    financial: false,
    filters: ['accommodation'],
    async build(ctx) {
      const accs = await loadAccommodations(ctx);
      const groups: Group[] = accs.map((a) => ({
        title: `${a.accommodation.name}${a.accommodation.city ? ` · ${a.accommodation.city}` : ''}`,
        rows: [...a.rooms]
          .sort(byIdentifier)
          .flatMap((room) =>
            room.assignments.map((as) => ({
              room: room.accommodation_room.identifier + (room.accommodation_room.name ? ` · ${room.accommodation_room.name}` : ''),
              type: roomTypeLabel[room.accommodation_room.room_type],
              name: as.reservation.passenger_name,
            })),
          ),
      }));
      return {
        report: { title: this.title, columns: [{ key: 'room', label: 'Quarto', width: 1.2 }, { key: 'type', label: 'Tipo', width: 0.9 }, { key: 'name', label: 'Hóspede', width: 3 }], groups },
        filters: await accommodationFilter(ctx),
      };
    },
  },
  {
    slug: 'por-quarto',
    title: 'Lista por quarto',
    description: 'Cada quarto com capacidade, ocupação e hóspedes.',
    financial: false,
    filters: ['accommodation'],
    async build(ctx) {
      const accs = await loadAccommodations(ctx);
      const rows: Row[] = accs.flatMap((a) =>
        [...a.rooms].sort(byIdentifier).map((room) => {
          const cap = roomCapacity(room);
          return {
            acc: a.accommodation.name,
            room: room.accommodation_room.identifier,
            type: roomTypeLabel[room.accommodation_room.room_type],
            occ: `${room.assignments.length}/${cap}`,
            guests: room.assignments.map((x) => x.reservation.passenger_name).join(', ') || null,
          };
        }),
      );
      return {
        report: {
          title: this.title,
          columns: [
            { key: 'acc', label: 'Pousada', width: 1.4 },
            { key: 'room', label: 'Quarto', width: 0.6 },
            { key: 'type', label: 'Tipo', width: 0.9 },
            { key: 'occ', label: 'Ocupação', width: 0.7 },
            { key: 'guests', label: 'Hóspedes', width: 3.5 },
          ],
          rows,
          landscape: true,
        },
        filters: await accommodationFilter(ctx),
      };
    },
  },
  {
    slug: 'pagamentos',
    title: 'Lista de pagamentos',
    description: 'Todos os lançamentos de passageiros, com estornos e reembolsos.',
    financial: true,
    filters: ['period'],
    async build(ctx) {
      const { from, to } = ctx.query;
      const payments = await ctx.prisma.customerPayment.findMany({
        where: {
          reservation: { trip_id: ctx.trip.id },
          ...(from || to ? { payment_date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
        },
        include: { reservation: { select: { passenger_name: true } } },
        orderBy: [{ payment_date: 'asc' }, { created_at: 'asc' }],
      });
      const users = await ctx.prisma.user.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.created_by))] } }, select: { id: true, name: true } });
      const name = new Map(users.map((u) => [u.id, u.name]));
      const signed = (p: (typeof payments)[number]) => (p.kind === 'REEMBOLSO' ? -p.amount : p.amount);
      const rows = payments.map((p) => ({
        date: dateISO(p.payment_date),
        name: p.reservation.passenger_name,
        kind: p.kind === 'REEMBOLSO' ? 'Reembolso' : 'Pagamento',
        method: methodLabel[p.payment_method],
        amount: signed(p),
        status: p.status === 'ESTORNADO' ? `Estornado: ${p.reversal_reason ?? ''}` : 'Válido',
        ref: p.reference,
        by: name.get(p.created_by) ?? null,
      }));
      const total = payments.filter((p) => p.status === 'VALIDO').reduce((n, p) => n + signed(p), 0);
      const filters = [from && `de ${from.split('-').reverse().join('/')}`, to && `até ${to.split('-').reverse().join('/')}`].filter(Boolean) as string[];
      return {
        report: {
          title: this.title,
          columns: [
            { key: 'date', label: 'Data', type: 'date', width: 0.8 },
            { key: 'name', label: 'Passageiro', width: 1.8 },
            { key: 'kind', label: 'Tipo', width: 0.8 },
            { key: 'method', label: 'Forma', width: 0.9 },
            { key: 'amount', label: 'Valor', type: 'money', width: 1 },
            { key: 'status', label: 'Situação', width: 1.4 },
            { key: 'ref', label: 'Identificador', width: 1.1 },
            { key: 'by', label: 'Lançado por', width: 1 },
          ],
          rows,
          totals: { name: 'Total válido', amount: total },
          landscape: true,
        },
        filters: filters.length ? [`Período ${filters.join(' ')}`] : [],
      };
    },
  },
  {
    slug: 'inadimplentes',
    title: 'Lista de inadimplentes',
    description: 'Quem tem parcela ou prazo vencido, com valor em atraso e contato.',
    financial: true,
    async build(ctx) {
      const late = (await loadReservations(ctx)).map((r) => ({ r, f: financeOf(r) })).filter(({ f }) => f.status === 'ATRASADO');
      const sensitive = hasPermission(ctx.user, 'sensitive.view');
      const rows = late.map(({ r, f }) => ({
        name: r.passenger_name,
        phone: sensitive ? phone(r.customer.whatsapp ?? r.customer.phone) : null,
        contracted: r.final_price,
        paid: f.paid,
        balance: f.balance,
        overdue: f.overdue_amount || f.balance,
        due: f.installments.find((i) => i.status === 'VENCIDA')?.due_date ?? (r.payment_due_date ? dateISO(r.payment_due_date) : null),
      }));
      return {
        report: {
          title: this.title,
          columns: [
            { key: 'name', label: 'Passageiro', width: 1.8 },
            ...(sensitive ? [{ key: 'phone', label: 'WhatsApp', width: 1.1 }] : []),
            { key: 'contracted', label: 'Contratado', type: 'money' as const },
            { key: 'paid', label: 'Pago', type: 'money' as const },
            { key: 'balance', label: 'Saldo', type: 'money' as const },
            { key: 'overdue', label: 'Vencido', type: 'money' as const },
            { key: 'due', label: 'Venceu em', type: 'date' as const, width: 0.8 },
          ],
          rows,
          totals: { name: 'Total', balance: rows.reduce((n, x) => n + x.balance, 0), overdue: rows.reduce((n, x) => n + Number(x.overdue), 0) },
          landscape: true,
        },
        filters: [],
      };
    },
  },
  {
    slug: 'despesas',
    title: 'Demonstrativo de despesas',
    description: 'Despesas por categoria com previsto, pago e saldo.',
    financial: true,
    async build(ctx) {
      const expenses = await ctx.prisma.tripExpense.findMany({
        where: { trip_id: ctx.trip.id },
        include: { category: true, payments: true },
        orderBy: [{ category: { name: 'asc' } }, { created_at: 'asc' }],
      });
      const byCat = new Map<string, Row[]>();
      let planned = 0, paid = 0, balance = 0;
      for (const e of expenses) {
        const f = expenseFinance(e);
        if (!e.cancelled_at) {
          planned += e.planned_amount;
          balance += Math.max(0, f.balance);
        }
        paid += f.paid;
        const rows = byCat.get(e.category.name) ?? [];
        rows.push({
          desc: e.description + (e.cost_type === 'POR_PESSOA' ? ' (por passageiro)' : ''),
          supplier: e.supplier_name,
          planned: e.cancelled_at ? null : e.planned_amount,
          paid: f.paid,
          balance: e.cancelled_at ? null : f.balance,
          due: e.due_date ? dateISO(e.due_date) : null,
          status: expenseLabel[f.status],
        });
        byCat.set(e.category.name, rows);
      }
      return {
        report: {
          title: this.title,
          columns: [
            { key: 'desc', label: 'Despesa', width: 2 },
            { key: 'supplier', label: 'Fornecedor', width: 1.3 },
            { key: 'planned', label: 'Previsto', type: 'money' },
            { key: 'paid', label: 'Pago', type: 'money' },
            { key: 'balance', label: 'Saldo', type: 'money' },
            { key: 'due', label: 'Vencimento', type: 'date', width: 0.8 },
            { key: 'status', label: 'Situação', width: 1 },
          ],
          groups: [...byCat.entries()].map(([title, rows]) => ({ title, rows })),
          totals: { desc: 'Total', planned, paid, balance },
          landscape: true,
        },
        filters: [],
      };
    },
  },
  {
    slug: 'financeiro',
    title: 'Relatório financeiro',
    description: 'Receitas, recebimentos, despesas e situação dos passageiros.',
    financial: true,
    async build(ctx) {
      const { fin, reservations } = await tripNumbers(ctx);
      const count = (s: FinancialStatus) => reservations.filter(({ f }) => f.status === s).length;
      const rows: Row[] = [
        { item: 'Receita prevista', value: fin.revenue_expected },
        { item: 'Receita recebida', value: fin.revenue_received },
        { item: 'Valores a receber', value: fin.revenue_pending },
        { item: 'Valores vencidos', value: reservations.reduce((n, { f }) => n + f.overdue_amount, 0) },
        { item: 'Despesas previstas', value: fin.expenses_expected },
        { item: 'Despesas pagas', value: fin.expenses_paid },
        { item: 'Despesas pendentes', value: fin.expenses_pending },
        { item: 'Retido de cancelamentos', value: fin.retained_from_cancellations },
        { item: 'Passageiros pagantes', value: null, text: String(fin.paying_passengers) },
        { item: 'Cortesias', value: null, text: String(fin.courtesy_passengers) },
        { item: 'Ticket médio', value: fin.average_ticket },
        { item: 'Pagos / parciais / pendentes / atrasados', value: null, text: `${count('PAGO')} / ${count('PARCIALMENTE_PAGO')} / ${count('PENDENTE')} / ${count('ATRASADO')}` },
      ];
      return {
        report: { title: this.title, columns: [{ key: 'item', label: 'Indicador', width: 2.5 }, { key: 'value', label: 'Valor', type: 'money', width: 1 }, { key: 'text', label: 'Quantidade', width: 1 }], rows },
        filters: [],
      };
    },
  },
  {
    slug: 'lucro',
    title: 'Relatório de lucro',
    description: 'Previsto x realizado: receita, despesas por categoria, lucro e margem.',
    financial: true,
    async build(ctx) {
      const { fin, expenses } = await tripNumbers(ctx);
      const byCat = new Map<string, { planned: number; paid: number }>();
      for (const { e, f } of expenses) {
        const row = byCat.get(e.category.name) ?? { planned: 0, paid: 0 };
        if (!e.cancelled_at) row.planned += e.planned_amount;
        row.paid += f.paid;
        byCat.set(e.category.name, row);
      }
      const rows: Row[] = [
        { item: 'Receita', expected: fin.revenue_expected, realized: fin.revenue_received },
        ...[...byCat.entries()].map(([name, v]) => ({ item: `(-) ${name}`, expected: negative(v.planned), realized: negative(v.paid) })),
        { item: 'Despesas totais', expected: negative(fin.expenses_expected), realized: negative(fin.expenses_paid) },
      ];
      return {
        report: {
          title: this.title,
          columns: [{ key: 'item', label: 'Linha', width: 2.5 }, { key: 'expected', label: 'Previsto', type: 'money' }, { key: 'realized', label: 'Realizado', type: 'money' }],
          rows,
          totals: { item: 'Lucro / resultado', expected: fin.profit_expected, realized: fin.result_realized },
          notes: [
            `Margem prevista: ${fin.margin_expected === null ? '—' : `${(fin.margin_expected * 100).toFixed(1).replace('.', ',')}%`} · margem realizada: ${fin.margin_realized === null ? '—' : `${(fin.margin_realized * 100).toFixed(1).replace('.', ',')}%`}.`,
            fin.break_even_passengers === null ? 'Ponto de equilíbrio: ainda sem dados.' : `Ponto de equilíbrio: ${fin.break_even_passengers} passageiro(s) pagante(s); hoje são ${fin.paying_passengers}.`,
          ],
        },
        filters: [],
      };
    },
  },
  {
    slug: 'roteiro',
    title: 'Roteiro da viagem',
    description: 'Programação dia a dia. Itens internos só com o filtro marcado.',
    financial: false,
    filters: ['internal'],
    async build(ctx) {
      const internal = ctx.query.internal === '1' && ctx.user.role !== 'VISUALIZADOR';
      const items = await ctx.prisma.itineraryItem.findMany({
        where: { trip_id: ctx.trip.id, ...(internal ? {} : { is_public: true }) },
        orderBy: [{ itinerary_date: 'asc' }, { start_time: { sort: 'asc', nulls: 'first' } }, { sort_order: 'asc' }],
      });
      const byDay = new Map<string, Row[]>();
      for (const i of items) {
        const day = dateISO(i.itinerary_date);
        const rows = byDay.get(day) ?? [];
        rows.push({
          time: [i.start_time, i.end_time].filter(Boolean).join('–') || null,
          activity: i.activity + (i.is_public ? '' : ' (interno)'),
          place: [i.location, i.meeting_point && `encontro: ${i.meeting_point}`].filter(Boolean).join(' · ') || null,
          info: [i.included_services && `Incluso: ${i.included_services}`, i.public_instructions, internal && i.internal_notes && `Interno: ${i.internal_notes}`].filter(Boolean).join('\n') || null,
        });
        byDay.set(day, rows);
      }
      const groups = [...byDay.entries()].map(([day, rows], n) => ({ title: `Dia ${n + 1} · ${day.split('-').reverse().join('/')}`, rows }));
      return {
        report: {
          title: this.title,
          columns: [{ key: 'time', label: 'Horário', width: 0.8 }, { key: 'activity', label: 'Atividade', width: 2 }, { key: 'place', label: 'Local', width: 1.6 }, { key: 'info', label: 'Orientações', width: 2.2 }],
          groups,
          landscape: true,
        },
        filters: [internal ? 'Inclui itens e observações internas' : 'Só itens públicos'],
      };
    },
  },
];

// Sem "-R$ 0,00": zero fica zero.
const negative = (n: number) => (n === 0 ? 0 : -n);

async function tripNumbers(ctx: ReportContext) {
  const [reservations, expenses] = await Promise.all([
    ctx.prisma.reservation.findMany({ where: { trip_id: ctx.trip.id }, include: { payments: true, payment_plan: { include: { installments: true } } } }),
    ctx.prisma.tripExpense.findMany({ where: { trip_id: ctx.trip.id }, include: { payments: true, category: true } }),
  ]);
  const res = reservations.map((r) => ({ r, f: financeOf(r) }));
  const exp = expenses.map((e) => ({ e, f: expenseFinance(e) }));
  const fin = tripFinance(
    res.map(({ r, f }) => ({ reservation_status: r.reservation_status, final_price: r.final_price, is_courtesy: r.is_courtesy, paid: f.paid })),
    exp.map(({ e, f }) => ({ cancelled: !!e.cancelled_at, cost_type: e.cost_type, planned_amount: e.planned_amount, paid: f.paid })),
  );
  return { fin, reservations: res, expenses: exp };
}
