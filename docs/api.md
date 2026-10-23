# API

Base: o endereço da API (`VITE_API_BASE_URL`). Todas as respostas são JSON, exceto relatórios e arquivos.

- **Autenticação:** `POST /auth/login` devolve `accessToken`, válido por pouco tempo, e `refreshToken`. Mande `Authorization: Bearer <accessToken>`. Quando a API responder 401, peça um novo em `POST /auth/refresh`.
- **Permissões:** cada rota exige uma permissão (coluna abaixo). As permissões de cada perfil estão em `backend/src/lib/permissions.ts`. Sem permissão, a resposta é **403**.
- **Escopo de viagem:** quem não é Administrador só acessa viagens em que foi incluído. Viagem, reserva ou assento fora desse escopo responde **404**, para não revelar que o registro existe.
- **Erros:** `{ "message": "…" }`, com `issues` quando a validação falha (400) e `code` nos casos que a tela trata, como `CPF_DUPLICATE`, `TRIP_FULL`, `SEAT_TAKEN`, `ROOM_FULL` e `OVERPAYMENT` (409).
- **Dinheiro:** sempre em centavos (inteiro). Datas de vencimento em `AAAA-MM-DD`.
- **Limites de requisição:** login (20/min por IP), recuperação de senha (5/min) e link público (30/min).

Total: 107 rotas.

## Autenticação

| Método | Rota | Permissão |
| --- | --- | --- |
| POST | `/auth/login` | pública |
| POST | `/auth/refresh` | pública |
| POST | `/auth/logout` | login |
| POST | `/auth/forgot-password` | pública |
| POST | `/auth/reset-password` | pública |
| GET | `/auth/me` | login |

## Usuários

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/users/options` | `trips.manage_access` |
| GET | `/users` | `users.manage` |
| POST | `/users` | `users.manage` |
| PATCH | `/users/:id` | `users.manage` |

## Clientes

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/customers` | `customers.read` |
| POST | `/customers` | `customers.write` |
| GET | `/customers/:id` | `customers.read` |
| PATCH | `/customers/:id` | `customers.write` |
| POST | `/customers/:id/archive` | `customers.archive` |
| POST | `/customers/:id/restore` | `customers.archive` |
| GET | `/customers/:id/history` | `audit.read` |

## Clientes: vínculos, histórico e LGPD

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/customers/:id/relationships` | `customers.read` |
| POST | `/customers/:id/relationships` | `customers.write` |
| DELETE | `/customer-relationships/:id` | `customers.write` |
| GET | `/trips/:id/groups` | `trips.read` |
| GET | `/customers/:id/trips` | `customers.read` |
| GET | `/customers/:id/export` | `privacy.manage` |
| POST | `/customers/:id/anonymize` | `privacy.manage` |

## Viagens

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/trips` | `trips.read` |
| POST | `/trips` | `trips.write` |
| GET | `/trips/:id` | `trips.read` |
| PATCH | `/trips/:id` | `trips.write` |
| POST | `/trips/:id/duplicate` | `trips.write` |
| POST | `/trips/:id/cancel` | `trips.write` |
| POST | `/trips/:id/archive` | `trips.write` |
| POST | `/trips/:id/restore` | `trips.write` |
| GET | `/trips/:id/dashboard` | `trips.read` |
| GET | `/trips/:id/users` | `trips.manage_access` |
| PUT | `/trips/:id/users` | `trips.manage_access` |

## Reservas e link do passageiro

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/public/reservations/:token` | pública |
| GET | `/trips/:id/reservations` | `trips.read` |
| POST | `/trips/:id/reservations` | `reservations.write` |
| GET | `/reservations/:id` | `trips.read` |
| PATCH | `/reservations/:id` | `reservations.write` |
| POST | `/reservations/:id/cancel` | `reservations.write` |
| POST | `/reservations/:id/regenerate-public-link` | `reservations.write` |
| POST | `/reservations/:id/revoke-public-link` | `links.revoke` |

## Veículos e layouts

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/vehicle-templates` | `trips.read` |
| POST | `/vehicle-templates` | `vehicles.manage` |
| PATCH | `/vehicle-templates/:id` | `vehicles.manage` |
| GET | `/vehicle-templates/:id/layouts` | `trips.read` |
| POST | `/vehicle-templates/:id/layouts` | `vehicles.manage` |
| PATCH | `/seat-layouts/:id` | `vehicles.manage` |
| POST | `/seat-layouts/:id/duplicate` | `vehicles.manage` |

## Transporte da viagem e assentos

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/trips/:id/vehicles` | `trips.read` |
| POST | `/trips/:id/vehicles` | `trips.write` |
| PATCH | `/trip-vehicles/:id` | `trips.write` |
| DELETE | `/trip-vehicles/:id` | `trips.write` |
| POST | `/reservations/:id/seat-assignment` | `seats.assign` |
| DELETE | `/reservations/:id/seat-assignment` | `seats.assign` |
| POST | `/trip-seats/:id/block` | `seats.assign` |
| POST | `/trip-seats/:id/unblock` | `seats.assign` |

## Pousadas, quartos e hóspedes

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/accommodations` | `trips.read` |
| POST | `/accommodations` | `accommodations.manage` |
| PATCH | `/accommodations/:id` | `accommodations.manage` |
| POST | `/accommodations/:id/rooms` | `accommodations.manage` |
| PATCH | `/rooms/:id` | `accommodations.manage` |
| GET | `/trips/:id/accommodations` | `trips.read` |
| POST | `/trips/:id/accommodations` | `trips.write` |
| PATCH | `/trip-accommodations/:id` | `trips.write` |
| DELETE | `/trip-accommodations/:id` | `trips.write` |
| POST | `/trip-accommodations/:id/rooms` | `trips.write` |
| PATCH | `/trip-rooms/:id` | `trips.write` |
| POST | `/reservations/:id/room-assignment` | `rooms.assign` |
| POST | `/trip-rooms/:id/guests` | `rooms.assign` |
| DELETE | `/reservations/:id/room-assignment` | `rooms.assign` |

## Comprovantes

| Método | Rota | Permissão |
| --- | --- | --- |
| POST | `/files` | `finance.write` ou `expenses.write` (multipart, campo `file`) |
| GET | `/files/:id/url` | `finance.read` ou quem enviou o arquivo |
| GET | `/files/download` | link assinado (só no modo local) |

## Pagamentos de passageiros

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/reservations/:id/finance` | `finance.read` ou `finance.write` |
| POST | `/reservations/:id/payment-plan` | `finance.write` |
| POST | `/reservations/:id/payments` | `finance.write` |
| POST | `/payments/:id/reverse` | `finance.reverse` |
| POST | `/reservations/:id/refunds` | `finance.reverse` |
| GET | `/trips/:id/receivables` | `finance.read` |
| GET | `/trips/:id/payments` | `finance.read` |

## Despesas e dashboard financeiro

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/expense-categories` | `finance.read` |
| POST | `/expense-categories` | `expenses.write` |
| GET | `/trips/:id/expenses` | `finance.read` |
| POST | `/trips/:id/expenses` | `expenses.write` |
| PATCH | `/expenses/:id` | `expenses.write` |
| POST | `/expenses/:id/cancel` | `expenses.write` |
| POST | `/expenses/:id/payments` | `expenses.write` |
| POST | `/expense-payments/:id/reverse` | `finance.reverse` |
| GET | `/trips/:id/finance-dashboard` | `finance.read` |

## Simulador de preços

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/pricing-scenarios` | `finance.read` |
| POST | `/pricing-scenarios` | `pricing.write` |
| GET | `/trips/:id/pricing-scenarios` | `finance.read` |
| POST | `/trips/:id/pricing-scenarios` | `pricing.write` |
| GET | `/trips/:id/pricing-defaults` | `finance.read` |
| PATCH | `/pricing-scenarios/:id` | `pricing.write` |
| DELETE | `/pricing-scenarios/:id` | `pricing.write` |
| POST | `/pricing-scenarios/:id/calculate` | `finance.read` |
| POST | `/pricing-scenarios/:id/apply` | `trips.write` |

## Roteiro

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/trips/:id/itinerary` | `trips.read` |
| POST | `/trips/:id/itinerary` | `itinerary.write` |
| PATCH | `/itinerary-items/:id` | `itinerary.write` |
| DELETE | `/itinerary-items/:id` | `itinerary.write` |
| POST | `/trips/:id/itinerary/reorder` | `itinerary.write` |

## Relatórios

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/trips/:id/reports` | `reports.read` |
| GET | `/trips/:id/reports/:slug` | `reports.read`; financeiros exigem `reports.financial`. `?format=pdf\|csv\|xlsx` |

## Outras

| Método | Rota | Permissão |
| --- | --- | --- |
| GET | `/health` | pública |
