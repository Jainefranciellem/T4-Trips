import { describe, expect, it } from 'vitest';
import { calculatePricing, compareByPassengers, pricingProblem, type PricingInput } from '../src/lib/pricing-rules.js';

const base: PricingInput = {
  paying_passengers: 20,
  courtesy_passengers: 2,
  vehicle_capacity: 28,
  fixed_costs: 1_000_000, // R$ 10.000 (ônibus)
  variable_cost_per_person: 50_000, // R$ 500 (hospedagem + café)
  discounts: 0,
  installment_fee_bp: 0,
  contingency_type: 'PERCENTUAL',
  contingency_value: 0,
  desired_margin_bp: 2000,
  desired_price: null,
};

describe('simulador (RN-011 / CA-014)', () => {
  it('custo total inclui cortesias e o custo por pagante divide só pelos pagantes', () => {
    const r = calculatePricing(base);
    // 10.000 + 500 × 22 = 21.000
    expect(r.total_cost).toBe(2_100_000);
    expect(r.cost_per_paying).toBe(105_000);
    expect(r.minimum_price).toBe(105_000);
  });

  it('preço sugerido entrega a margem desejada sobre a receita', () => {
    const r = calculatePricing(base);
    // 21.000 / 0,8 / 20 = 1.312,50
    expect(r.suggested_price).toBe(131_250);
    expect(r.estimated_revenue).toBe(2_625_000);
    expect(r.estimated_profit).toBe(525_000);
    expect(r.estimated_margin).toBeCloseTo(0.2);
  });

  it('taxa de parcelamento, descontos e reserva para imprevistos entram na conta', () => {
    const r = calculatePricing({ ...base, installment_fee_bp: 500, discounts: 100_000, contingency_value: 1000 });
    // custo 21.000 + 10% = 23.100; preço = (23.100/0,75 + 1.000)/20
    expect(r.total_cost).toBe(2_310_000);
    expect(r.suggested_price).toBe(Math.ceil((2_310_000 / 0.75 + 100_000) / 20));
    expect(r.estimated_margin).toBeCloseTo(0.2, 2);
    const fixed = calculatePricing({ ...base, contingency_type: 'FIXO', contingency_value: 150_000 });
    expect(fixed.contingency).toBe(150_000);
  });

  it('ponto de equilíbrio no preço testado', () => {
    // Preço 1.500: cada pagante deixa 1.000 líquido; fixos 10.000 + 2 cortesias 1.000 = 11.000 → 11 pagantes.
    const r = calculatePricing({ ...base, desired_price: 150_000 });
    expect(r.break_even_passengers).toBe(11);
    expect(calculatePricing({ ...base, desired_price: 40_000 }).break_even_passengers).toBeNull();
  });

  it('avisa preço abaixo do mínimo e lotação do veículo', () => {
    expect(calculatePricing({ ...base, desired_price: 90_000 }).warnings).toContain('O preço desejado fica abaixo do mínimo e dá prejuízo');
    expect(calculatePricing({ ...base, paying_passengers: 30 }).warnings[0]).toMatch(/veículo comporta 28/);
  });

  it('exige pagantes e margem + taxa abaixo de 100%', () => {
    expect(pricingProblem({ ...base, paying_passengers: 0 })).not.toBeNull();
    expect(pricingProblem({ ...base, installment_fee_bp: 3000, desired_margin_bp: 7000 })).not.toBeNull();
    expect(pricingProblem(base)).toBeNull();
  });

  it('compara quantidades de passageiros no mesmo preço', () => {
    const rows = compareByPassengers(base, [10, 20, 28]);
    expect(rows.map((r) => r.paying_passengers)).toEqual([10, 20, 28]);
    expect(rows[0].profit).toBeLessThan(0);
    expect(rows[1].profit).toBe(525_000);
    expect(rows[2].profit).toBeGreaterThan(rows[1].profit);
  });
});

describe('cópia do frontend', () => {
  it('src/lib/pricing.ts tem a mesma conta que o backend', async () => {
    const { readFileSync } = await import('node:fs');
    const body = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8')
        .split('\n')
        .filter((l, i, all) => i >= all.findIndex((x) => !x.startsWith('//')))
        .join('\n');
    expect(body('../../src/lib/pricing.ts')).toBe(body('../src/lib/pricing-rules.ts'));
  });
});
