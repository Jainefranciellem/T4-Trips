import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const cents = (label: string) => z.number().int(`${label} inválido`).min(0, `${label} inválido`);

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || !Number.isNaN(Date.parse(v)), 'Data inválida')
  .transform((v) => (v == null ? v : new Date(v)));

const manualStatus = z.enum(['PRE_RESERVA', 'RESERVADA', 'CONFIRMADA', 'LISTA_ESPERA']);

export const createReservationSchema = z.object({
  customer_id: z.string().uuid('Selecione o cliente'),
  reservation_status: manualStatus.default('RESERVADA'),
  // Sem valor informado, usa o valor padrão do pacote da viagem.
  package_price: cents('Valor do pacote').optional(),
  discount_amount: cents('Desconto').default(0),
  surcharge_amount: cents('Acréscimo').default(0),
  is_courtesy: z.boolean().default(false),
  payment_due_date: optionalDate,
  notes: optionalText,
  public_link_expires_at: optionalDate,
});

export const updateReservationSchema = z
  .object({
    reservation_status: manualStatus,
    package_price: cents('Valor do pacote'),
    discount_amount: cents('Desconto'),
    surcharge_amount: cents('Acréscimo'),
    is_courtesy: z.boolean(),
    payment_due_date: optionalDate,
    notes: optionalText,
    // Motivo opcional; vai pra auditoria junto com a alteração.
    reason: optionalText,
  })
  .partial();

export const cancelReservationSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo do cancelamento'),
});

export const regenerateLinkSchema = z.object({
  expires_at: optionalDate,
});

export const listReservationsQuery = z.object({
  status: z
    .enum(['ATIVAS', 'TODAS', 'PRE_RESERVA', 'RESERVADA', 'CONFIRMADA', 'PARCIALMENTE_PAGA', 'PAGA', 'ATRASADA', 'CANCELADA', 'REEMBOLSADA', 'LISTA_ESPERA'])
    .default('TODAS'),
  q: z.string().trim().optional(),
});
