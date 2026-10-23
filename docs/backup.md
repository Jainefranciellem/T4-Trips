# Backup e restauração

## Política

| Item | Regra |
| --- | --- |
| Frequência | Semanal, toda segunda-feira às 3h (Brasília), e também à mão quando quiser |
| O que entra | O banco inteiro: clientes, viagens, reservas, pagamentos, despesas, auditoria |
| Formato | `pg_dump --format=custom`; antes de guardar, o workflow confere que o arquivo abre |
| Onde fica | Artefato privado do repositório no GitHub (Actions → Backup do banco) |
| Retenção | 90 dias, ou seja, cerca de 13 cópias semanais |
| Comprovantes | Ficam no R2, que tem durabilidade própria; não entram no dump |
| Teste de restauração | A cada 3 meses, restaurar a cópia mais recente num banco à parte (passo a passo abaixo) |

Além disso, o Neon guarda um histórico curto do banco que permite voltar no tempo pelo painel. O prazo depende do plano; confira em Neon → Restore.

O que fica fora do backup e por quê:
- **Arquivos dos comprovantes:** no banco ficam só o nome, o tipo e o checksum. Para ter cópia dos arquivos, ative a replicação do R2 ou baixe o bucket periodicamente com `rclone`.
- **Variáveis de ambiente:** guarde uma cópia das variáveis do Render num cofre de senhas.

## Fazer um backup agora

GitHub → Actions → **Backup do banco** → Run workflow. Ao terminar, o arquivo `t4trips-AAAA-MM-DD.dump` fica em Artifacts.

## Restaurar

Use isto quando o banco se perder, ou para testar a restauração. Para testar, aponte para um banco **novo** e nunca para o de produção.

1. Baixe o artefato `.dump` mais recente no GitHub Actions.
2. Crie um banco vazio. No Neon, o mais fácil é criar uma branch nova (Branches → New branch → "empty").
3. Restaure (precisa do cliente do Postgres 16):
   ```bash
   pg_restore --no-owner --no-privileges -d "postgresql://…conexão-direta-do-banco-novo…" t4trips-AAAA-MM-DD.dump
   ```
4. Confira a restauração:
   ```bash
   psql "postgresql://…" -c "select count(*) from customers; select count(*) from reservations; select count(*) from _prisma_migrations;"
   ```
5. Para colocar em produção, troque `DATABASE_URL` e `DIRECT_URL` no Render para o banco restaurado e reinicie o serviço. A API aplica sozinha as migrações que estiverem faltando.

## Último teste

Em 23/10/2026 o procedimento acima foi executado contra o banco de desenvolvimento: dump, restauração num banco novo e conferência. Voltaram as 14 categorias, as 8 migrações e os 4 índices únicos parciais, que impedem dois passageiros no mesmo assento, duas reservas ativas do mesmo cliente e duas atribuições de quarto. Ainda não houve teste contra o Neon de produção, porque ele ainda não existe. Faça esse teste junto com o checklist do primeiro deploy.
