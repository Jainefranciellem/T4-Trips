# Critérios de aceite e testes

Cada critério da seção 12 da especificação está ligado ao teste automatizado que o verifica. Os testes ficam em `backend/tests/`: `*.test.ts` são unitários e `*.itest.ts` são de integração, rodando a API de verdade contra um banco de teste.

Situação em 23/10/2026: **64 testes unitários e 114 de integração, todos passando** (`npm test` e `npm run test:integration` em `backend/`). Os critérios também foram conferidos à mão no navegador, no computador e no celular, ao fim de cada fase.

A seção 16.3 pede que os mesmos critérios sejam executados no ambiente de homologação. Esse ambiente ainda não existe, então essa execução continua pendente (veja [limitacoes.md](limitacoes.md)).

## Seção 12: critérios de aceite do MVP

| Critério | O que verifica | Onde |
| --- | --- | --- |
| CA-001 Cadastro de viagem | Bloqueia nome vazio, capacidade ≤ 0, retorno antes da saída, valor inválido | `api.itest.ts` › valida o cadastro (CA-001); `rules.test.ts` |
| CA-002 Reutilização de cliente | Reserva usa o mesmo cadastro, sem duplicar | `reservations.itest.ts` › reutiliza o cliente sem duplicar o cadastro (CA-002) |
| CA-003 CPF duplicado | Bloqueia e aponta o cadastro existente | `api.itest.ts` › cria cliente e bloqueia CPF duplicado (CA-003) |
| CA-004 Assento duplicado | Assento ocupado recusa outro passageiro | `transport.itest.ts` › bloqueia assento ocupado (CA-004); `seat-rules.test.ts` |
| CA-005 Capacidade do veículo | Não passa da capacidade operacional | `transport.itest.ts` › respeita a capacidade operacional do veículo (CA-005) |
| CA-006 Transferência de assento | Remove o anterior, atribui o novo e audita | `transport.itest.ts` › transfere de assento removendo o anterior e audita (CA-006) |
| CA-007 Capacidade de quarto | Terceiro hóspede num duplo é recusado | `accommodations.itest.ts` › bloqueia o terceiro hóspede num duplo (CA-007); `room-rules.test.ts` |
| CA-008 Duplicidade de quarto | Exige transferência explícita | `accommodations.itest.ts` › pede transferência explícita… (CA-008) |
| CA-009 Cancelamento | Status cancelado, libera assento e quarto, recalcula vaga, mantém pagamentos, audita | `reservations.itest.ts` › cancelamento (CA-009); `transport.itest.ts` e `accommodations.itest.ts` › cancelar libera… |
| CA-010 Pagamento integral | R$ 1.287 pagos → Pago e saldo zero | `finance.itest.ts` › pagamento integral (CA-010); `finance-rules.test.ts` |
| CA-011 Pagamento parcial | R$ 650 de R$ 1.287 → saldo R$ 637, parcialmente pago | `finance.itest.ts` › pagamento parcial (CA-011); `finance-rules.test.ts` |
| CA-012 Estorno | Sai do recebido, recalcula saldo, motivo obrigatório, histórico | `finance.itest.ts` › estorno exige motivo e permissão… (CA-012) |
| CA-013 Despesas | Totais previstos, pagos, pendentes e resultado automáticos | `finance.itest.ts` › dashboard financeiro (RF-020 / CA-013); `finance-rules.test.ts` |
| CA-014 Simulador | Custo por passageiro, preço sugerido, receita, lucro e equilíbrio | `planning.itest.ts` › simulador de preços (CA-014); `pricing-rules.test.ts` |
| CA-015 Link individual | Só dados públicos daquele passageiro | `reservations.itest.ts` › mostra só dados públicos (CA-015); `security.itest.ts` › não expõe CPF, contatos nem valores |
| CA-016 Revogação de link | Bloqueio imediato, nada da reserva exibido | `reservations.itest.ts` › revogado bloqueia na hora (CA-016); `security.itest.ts` |
| CA-017 Atualização pública | Link mostra assento e quarto atuais | `transport.itest.ts` e `accommodations.itest.ts` › … link mostram … (CA-017) |
| CA-018 Relatório de assentos | Nome, veículo e assento em ordem numérica | `reports.itest.ts` › lista por assento em ordem numérica (CA-018) |
| CA-019 Relatório de quartos | Agrupado por pousada e quarto | `reports.itest.ts` › hospedagem agrupada por pousada e quarto (CA-019) |
| CA-020 Permissões | Sem permissão financeira, a API nega e não devolve dados | `finance.itest.ts` › sem permissão financeira… (CA-020); `reports.itest.ts` (CA-020) |
| CA-021 Auditoria | Assento, quarto, pagamento e valor contratado auditados | `reservations.itest.ts` › alteração de valor contratado é auditada (CA-021); trocas de assento e quarto (CA-006, CA-008); estorno (CA-012) |
| CA-022 Persistência | Viagem concluída mantém passageiros, assentos, quartos, pagamentos, despesas, roteiro e relatórios | `reports.itest.ts` › viagem concluída (CA-022 / RN-015) |

## Seção 16.1: testes unitários

| Pedido | Onde |
| --- | --- |
| Cálculo de saldo e de status de pagamento | `finance-rules.test.ts` |
| Cálculo de despesas, lucro e ponto de equilíbrio | `finance-rules.test.ts`, `pricing-rules.test.ts` |
| Validação de capacidade | `reservation-rules.test.ts`, `seat-rules.test.ts`, `room-rules.test.ts` |
| Assento duplicado e quarto duplicado | `seat-rules.test.ts`, `room-rules.test.ts` |
| Geração e revogação de token | `reservations.itest.ts` (o token só existe gerado de verdade, por isso o teste é de integração) |
| Regras de cancelamento | `rules.test.ts`, `reservation-rules.test.ts` |

## Seção 16.2: testes de integração

Cliente e reserva, reserva e assento, reserva e quarto, pagamento e dashboard, despesa e dashboard, cancelamento e liberação, geração de relatório, permissões na API. Ficam em `reservations`, `transport`, `accommodations`, `finance`, `reports` e `security.itest.ts`.

## Seção 16.4: testes de segurança (`security.itest.ts`)

| Pedido | Teste |
| --- | --- |
| Acesso indevido entre viagens | equipe sem acesso à viagem B recebe 404 em tudo dela; não usa assento nem estorna pagamento de outra viagem |
| Usuário sem permissão | visualizador não altera nada; token adulterado ou ausente é recusado |
| Enumeração de reservas | token qualquer, curto ou o ID interno recebem a mesma resposta |
| Exposição de CPF | relatórios e listas mascaram para quem não vê dados pessoais (`reports.itest.ts`); o link público não traz CPF |
| Dados financeiros no link público | não expõe CPF, contatos nem valores |
| Upload inválido | tipo errado dá 415 (`finance.itest.ts`); arquivo acima de 5 MB dá 413 |
| Tentativas repetidas no endpoint público | o link público é limitado (429) |
| Revogação efetiva | revogação vale na hora |

Também testados: bloqueio da conta após 5 senhas erradas (`api.itest.ts`), cabeçalhos de segurança nas respostas, LGPD (exportação e anonimização).

## Acessibilidade (RNF-006)

Em 23/10/2026, a auditoria automática com o axe-core (regras WCAG 2.0/2.1 nível A e AA) rodou em 19 telas e 6 diálogos. As telas foram login, Minhas Trips, 11 dos 12 módulos da viagem (a aba Reservas ficou de fora, mas usa os mesmos componentes da aba Passageiros), clientes, veículos, pousadas, simulador, usuários e link do passageiro. Os diálogos foram nova viagem, adicionar passageiro, pagamentos, assento, item do roteiro e ficha do cliente. O resultado foi **zero violações** depois dos ajustes de contraste do laranja e da troca das abas sem painel por botões de filtro. A navegação por teclado segue a ordem do menu e do conteúdo, com foco visível. A auditoria automática não substitui o teste com leitor de tela, que continua pendente (veja [limitacoes.md](limitacoes.md)).
