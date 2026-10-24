# Implantação

Tudo roda em planos gratuitos, com custo mensal de R$ 0 para o volume de uma microempresa. A tabela mostra o que se cria em cada serviço. Os passos estão logo abaixo.

| Serviço | O que criar | Para quê |
| --- | --- | --- |
| GitHub | Repositório `Jainefranciellem/T4-Trips` (público) | Código, deploy automático e backup cifrado |
| Neon | Projeto Postgres 16, região São Paulo (`aws-sa-east-1`) | Banco de dados |
| Render | Web Service a partir do `render.yaml` | API |
| Vercel | Projeto apontando para a raiz do repositório | Site |
| Cloudflare R2 | Bucket privado `t4trips-comprovantes` e um token de API | Comprovantes |
| Resend | Conta e domínio verificado | E-mail de recuperação de senha |

## 1. Banco (Neon)

1. Crie o projeto `t4trips` no Neon, região São Paulo, Postgres 16.
2. Copie duas conexões no painel (Connection details):
   - **com pooler** (o endereço tem `-pooler`): vira `DATABASE_URL`. Acrescente `?sslmode=require&pgbouncer=true&connection_limit=5`.
   - **direta** (sem pooler): vira `DIRECT_URL` e também o segredo `BACKUP_DATABASE_URL` do backup.
3. As tabelas são criadas pela própria API: o contêiner roda `prisma migrate deploy` toda vez que sobe.

## 2. API (Render)

1. Em Render → New → Blueprint, aponte para o repositório. O `render.yaml` cria o serviço `t4trips-api`, que roda em Docker a partir de `backend/Dockerfile` e usa `/health` como checagem.
2. Preencha as variáveis marcadas como `sync: false`. A lista completa está em [variaveis.md](variaveis.md). `JWT_SECRET` e `JWT_REFRESH_SECRET` são gerados pelo Render.
3. Depois do primeiro deploy, crie o administrador. Abra o Shell do serviço e rode:
   ```bash
   SEED_ADMIN_EMAIL=dono@t4trips.com.br SEED_ADMIN_NAME="Nome" SEED_ADMIN_PASSWORD='uma-senha-forte' npx tsx prisma/seed.ts
   ```
   Se o Shell não estiver disponível no plano gratuito, rode o mesmo comando no seu computador, de dentro de `backend/`, com `DATABASE_URL` apontando para o Neon.
4. Teste o endereço `https://<sua-api>.onrender.com/health`. Ele deve responder `{"status":"ok"}`.

No plano gratuito, a API "dorme" depois de cerca de 15 minutos sem uso, e o primeiro acesso seguinte demora alguns segundos a mais.

## 3. Site (Vercel)

1. Importe o repositório na Vercel. Framework: Vite. A raiz do projeto é a raiz do repositório.
2. Crie a variável `VITE_API_BASE_URL` com o endereço da API, sem barra no final.
3. O `vercel.json` já envia todas as rotas para o `index.html` e aplica os cabeçalhos de segurança.
4. Volte ao Render e ajuste `CORS_ORIGIN` e `APP_URL` para o endereço do site. Use o domínio próprio, se houver.

## 4. Comprovantes (Cloudflare R2)

1. No Cloudflare, abra R2 → Create bucket → `t4trips-comprovantes`. Deixe o acesso público **desligado**.
2. Em Manage R2 API Tokens, crie um token com permissão **Object Read & Write**, restrito a esse bucket.
3. No Render, preencha `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`, e deixe `STORAGE_DRIVER=s3`.
4. Teste: envie um comprovante num pagamento e abra-o pelo clipe. O link dura 5 minutos.

## 5. E-mail (Resend)

Verifique o domínio no Resend e preencha `RESEND_API_KEY` e `EMAIL_FROM` (ex.: `T4 Trips <nao-responda@t4trips.com.br>`). Sem a chave, o link de recuperação de senha só aparece no log da API.

## 6. Backup (GitHub Actions)

Em Settings → Secrets and variables → Actions, crie `BACKUP_DATABASE_URL` com a conexão **direta** do Neon e `BACKUP_PASSPHRASE` com uma senha longa (guarde-a num cofre). O repositório é público, por isso o backup sai cifrado. O workflow `.github/workflows/backup.yml` roda toda segunda-feira e também pode ser disparado à mão. Detalhes em [backup.md](backup.md).

## Homologação e produção

A spec pede ambientes separados (RNF-005). Com os mesmos serviços gratuitos:

| | Homologação | Produção |
| --- | --- | --- |
| Código | branch `homologacao` | branch `main` |
| Banco | branch `homologacao` do projeto no Neon (cópia isolada) | branch principal do Neon |
| API | segundo serviço no Render, ligado à branch `homologacao` | `t4trips-api` |
| Site | Preview da Vercel da branch `homologacao` | domínio principal |
| R2 | bucket `t4trips-comprovantes-homolog` | `t4trips-comprovantes` |

Fluxo: as mudanças entram em `homologacao`, a T4 Trips valida (critérios em [criterios-de-aceite.md](criterios-de-aceite.md)) e então se faz o merge para `main`.

## Desenvolvimento local

O passo a passo está no [README](../README.md). Em desenvolvimento, `STORAGE_DRIVER=local` grava os comprovantes em `backend/storage/`, pasta que fica fora do git.

## Checklist do primeiro deploy

- [ ] `/health` responde `ok`
- [ ] Login com o administrador criado pelo seed
- [ ] Criar uma viagem, um cliente e uma reserva; abrir o link do passageiro num celular
- [ ] Registrar um pagamento com comprovante e abrir o comprovante
- [ ] Gerar um relatório em PDF e um em Excel
- [ ] "Esqueci minha senha" chega no e-mail
- [ ] Rodar o backup à mão no GitHub Actions e baixar o arquivo
