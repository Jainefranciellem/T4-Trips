# T4 Trips Manager

Sistema web da T4 Trips para gerir excursões e viagens de surf: clientes, viagens, reservas e vagas, assentos, quartos, pagamentos, despesas, simulador de preços, roteiro, link individual do passageiro e relatórios em PDF, CSV e Excel.

Feito a partir da especificação técnica "T4 Trips Manager", versão 1.0 (outubro de 2026).

## Tecnologia

| Parte | Tecnologia | Onde roda em produção |
| --- | --- | --- |
| Site (`/`) | React 18, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Query | Vercel |
| API (`/backend`) | Node 20, Fastify 5, Prisma 5, Zod, pdfkit, exceljs | Render (Docker) |
| Banco | PostgreSQL 16 | Neon |
| Comprovantes | Bucket privado compatível com S3 | Cloudflare R2 |
| E-mail (recuperação de senha) | Resend | — |
| Backup | `pg_dump` semanal | GitHub Actions |

Dinheiro é sempre guardado em centavos (inteiro). Datas de vencimento são dias; "hoje" é calculado no fuso de São Paulo.

## Rodar localmente

Requisitos: Node 20 e Docker.

```bash
# 1. Banco (Postgres em localhost:5433)
cd backend
docker compose up -d
cp .env.example .env          # preencha SEED_ADMIN_PASSWORD
npm install
npx prisma migrate deploy
npm run seed                  # categorias de despesa + primeiro administrador
npm run dev                   # API em http://localhost:3333

# 2. Site (outro terminal, na raiz)
cp .env.example .env
npm install
npm run dev                   # http://localhost:8080
```

## Testes

```bash
cd backend
npm test                      # regras de negócio (unitários)
npm run test:integration      # API contra um banco de teste isolado (t4trips_test)
```

O banco de teste precisa existir: `docker compose exec postgres createdb -U t4trips t4trips_test`.

Hoje são 64 testes unitários e 114 de integração, cobrindo os critérios de aceite CA-001 a CA-022 e os testes de segurança da seção 16.4. O mapa está em [docs/criterios-de-aceite.md](docs/criterios-de-aceite.md).

## Estrutura

```
src/                      site
  pages/                  telas (Minhas Trips, viagem, clientes, veículos…)
  components/             componentes por módulo (reservations, transport, finance…)
  lib/                    chamadas à API, formatação, cálculo do simulador
backend/
  prisma/                 schema, migrações versionadas e seed
  src/routes/             rotas da API, uma por módulo
  src/lib/                regras de negócio puras (vagas, assentos, quartos, financeiro, preço)
  src/lib/reports/        os 12 relatórios e os geradores de PDF/CSV/Excel
  tests/                  *.test.ts (unitários) e *.itest.ts (integração)
docs/                     documentação de entrega
.github/workflows/        backup semanal do banco
```

## Documentação

- [Manual de operação](docs/manual-de-operacao.md): para a equipe da T4 Trips.
- [Implantação](docs/implantacao.md): como colocar no ar, homologação e produção.
- [Variáveis de ambiente](docs/variaveis.md)
- [Backup e restauração](docs/backup.md)
- [API](docs/api.md): rotas e permissões.
- [Critérios de aceite](docs/criterios-de-aceite.md): onde cada CA é testado.
- [Limitações conhecidas](docs/limitacoes.md)
