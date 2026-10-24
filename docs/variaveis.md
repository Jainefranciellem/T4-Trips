# Variáveis de ambiente

## API (`backend/.env` em desenvolvimento, Render em produção)

| Variável | Obrigatória | Exemplo / padrão | Para quê |
| --- | --- | --- | --- |
| `DATABASE_URL` | sim | `postgresql://…-pooler…/neondb?sslmode=require&pgbouncer=true&connection_limit=5` | Conexão da API com o banco (com pooler no Neon) |
| `DIRECT_URL` | sim | `postgresql://…/neondb?sslmode=require` | Conexão direta, usada pelas migrações |
| `PORT` | não | `3333` | Porta da API |
| `NODE_ENV` | não | `production` | Liga o HSTS e desliga logs de teste |
| `CORS_ORIGIN` | sim | `https://app.t4trips.com.br` | Endereços do site que podem chamar a API (vários separados por vírgula) |
| `JWT_SECRET` | sim | 16+ caracteres aleatórios | Assina o token de acesso; também assina os links locais de arquivo |
| `JWT_REFRESH_SECRET` | sim | 16+ caracteres aleatórios, diferente do anterior | Assina o token de renovação de sessão |
| `APP_URL` | sim em produção | `https://app.t4trips.com.br` | Endereço do site, usado no link do passageiro e no e-mail de senha |
| `API_URL` | só com armazenamento local | `http://localhost:3333` | Endereço da API nos links temporários do modo local |
| `STORAGE_DRIVER` | não | `local` (dev) / `s3` (produção) | Onde ficam os comprovantes |
| `STORAGE_DIR` | não | `storage` | Pasta dos comprovantes no modo local |
| `R2_ACCOUNT_ID` | com `s3` | ID da conta Cloudflare | Endereço do R2 |
| `R2_ACCESS_KEY_ID` | com `s3` | — | Token do R2 (Object Read & Write, só no bucket) |
| `R2_SECRET_ACCESS_KEY` | com `s3` | — | Segredo do token do R2 |
| `R2_BUCKET` | com `s3` | `t4trips-comprovantes` | Bucket privado |
| `RESEND_API_KEY` | não | — | Envio do e-mail de recuperação de senha; sem ela o link sai só no log |
| `EMAIL_FROM` | não | `T4 Trips <nao-responda@t4trips.com.br>` | Remetente do e-mail |

Usadas só pelo seed (`npm run seed`):

| Variável | Exemplo | Para quê |
| --- | --- | --- |
| `SEED_ADMIN_EMAIL` | `admin@t4trips.com` | E-mail do primeiro administrador |
| `SEED_ADMIN_PASSWORD` | 8+ caracteres | Senha inicial (troque no primeiro acesso) |
| `SEED_ADMIN_NAME` | `Administrador` | Nome exibido |

Se as variáveis obrigatórias faltarem, a API não sobe e o log diz qual está faltando. Com `STORAGE_DRIVER=s3`, ela também exige as quatro `R2_*`.

## Site (`.env` na raiz, Vercel em produção)

| Variável | Exemplo | Para quê |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://t4trips-api.onrender.com` | Endereço da API (sem barra no final) |

## GitHub Actions (Settings → Secrets → Actions)

| Segredo | Para quê |
| --- | --- |
| `BACKUP_DATABASE_URL` | Conexão **direta** do Neon usada pelo `pg_dump` semanal |
| `BACKUP_PASSPHRASE` | Senha (20+ caracteres) que cifra o backup. O repositório é público, então sem ela o workflow não gera nada. Guarde-a num cofre de senhas: sem ela não dá para restaurar |

## Testes

`npm run test:integration` usa `TEST_DATABASE_URL`, que por padrão é `postgresql://t4trips:t4trips@localhost:5433/t4trips_test`. Os testes nunca rodam no banco de desenvolvimento.
