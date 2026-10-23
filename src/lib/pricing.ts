// Cópia de backend/src/lib/pricing-rules.ts (mantenha as duas iguais). Dinheiro
// em centavos, percentuais em pontos-base (1500 = 15%). Aqui serve pra mostrar
// o resultado enquanto se digita; o servidor recalcula ao salvar.

export interface PricingInput {
  paying_passengers: number;
  courtesy_passengers: number;
  vehicle_capacity: number | null;
  fixed_costs: number;
  // Custo de cada pessoa que viaja (pagante ou cortesia).
  variable_cost_per_person: number;
  // Total de descontos dados aos passageiros no cenário.
  discounts: number;
  // Taxa de parcelamento/cartão sobre a receita.
  installment_fee_bp: number;
  contingency_type: 'FIXO' | 'PERCENTUAL';
  // FIXO: centavos. PERCENTUAL: pontos-base sobre os custos.
  contingency_value: number;
  // Margem desejada sobre a receita.
  desired_margin_bp: number;
  // Preço que se quer testar; sem ele, vale o sugerido.
  desired_price: number | null;
}

const bp = (v: number) => v / 10_000;

export function pricingProblem(i: PricingInput): string | null {
  if (!Number.isInteger(i.paying_passengers) || i.paying_passengers <= 0) return 'Informe ao menos um passageiro pagante';
  if (i.courtesy_passengers < 0) return 'Cortesias inválidas';
  if (bp(i.installment_fee_bp) + bp(i.desired_margin_bp) >= 1) return 'Taxa de parcelamento e margem somadas precisam ficar abaixo de 100%';
  return null;
}

export function calculatePricing(i: PricingInput) {
  const fee = bp(i.installment_fee_bp);
  const margin = bp(i.desired_margin_bp);
  const pct = i.contingency_type === 'PERCENTUAL' ? bp(i.contingency_value) : 0;
  const people = i.paying_passengers + i.courtesy_passengers;

  // RN-011: custo por pessoa multiplicado por todos do cenário; cortesia não
  // paga, mas consome.
  const base_costs = i.fixed_costs + i.variable_cost_per_person * people;
  const contingency = i.contingency_type === 'FIXO' ? i.contingency_value : Math.round(base_costs * pct);
  const total_cost = base_costs + contingency;
  const cost_per_paying = Math.ceil(total_cost / i.paying_passengers);

  // Receita = preço × pagantes − descontos; a taxa sai da receita.
  // Mínimo: lucro zero. Sugerido: lucro = margem × receita.
  const priceFor = (m: number) => Math.ceil((total_cost / (1 - fee - m) + i.discounts) / i.paying_passengers);
  const minimum_price = priceFor(0);
  const suggested_price = priceFor(margin);
  const price = i.desired_price ?? suggested_price;

  const estimated_revenue = price * i.paying_passengers - i.discounts;
  const fees = Math.round(estimated_revenue * fee);
  const estimated_profit = estimated_revenue - fees - total_cost;
  const estimated_margin = estimated_revenue > 0 ? estimated_profit / estimated_revenue : null;

  // Pagantes necessários nesse preço, mantendo cortesias e descontos. Cada
  // pagante a mais traz preço líquido e custa o variável (com a reserva %).
  const perHead = price * (1 - fee) - i.variable_cost_per_person * (1 + pct);
  const fixedSide =
    (i.fixed_costs + i.variable_cost_per_person * i.courtesy_passengers) * (1 + pct) +
    (i.contingency_type === 'FIXO' ? i.contingency_value : 0) +
    i.discounts * (1 - fee);
  const break_even_passengers = perHead > 0 ? Math.max(1, Math.ceil(fixedSide / perHead - 1e-9)) : null;

  const warnings: string[] = [];
  if (i.vehicle_capacity !== null && people > i.vehicle_capacity) {
    warnings.push(`O cenário tem ${people} pessoas e o veículo comporta ${i.vehicle_capacity}`);
  }
  if (i.desired_price !== null && i.desired_price < minimum_price) warnings.push('O preço desejado fica abaixo do mínimo e dá prejuízo');
  if (break_even_passengers !== null && i.vehicle_capacity !== null && break_even_passengers + i.courtesy_passengers > i.vehicle_capacity) {
    warnings.push('O ponto de equilíbrio passa da capacidade do veículo');
  }

  return {
    price,
    base_costs,
    contingency,
    total_cost,
    cost_per_paying,
    minimum_price,
    suggested_price,
    estimated_revenue,
    fees,
    estimated_profit,
    estimated_margin,
    break_even_passengers,
    warnings,
  };
}

// "Comparar cenários com diferentes quantidades de passageiros" (RF-021):
// mesmo preço, variando os pagantes.
export function compareByPassengers(i: PricingInput, counts: number[]) {
  const price = calculatePricing(i).price;
  return counts
    .filter((n) => n > 0)
    .map((n) => {
      const r = calculatePricing({ ...i, paying_passengers: n, desired_price: price });
      return { paying_passengers: n, total_cost: r.total_cost, revenue: r.estimated_revenue, profit: r.estimated_profit, margin: r.estimated_margin };
    });
}
