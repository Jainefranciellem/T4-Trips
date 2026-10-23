# Limitações conhecidas

Estado em 23/10/2026, ao fim do MVP. Cada item diz o impacto e o que fazer.

## Ainda não validado em ambiente real

| Item | Situação | O que falta |
| --- | --- | --- |
| Armazenamento no Cloudflare R2 | O código usa a API do S3. Só o modo local foi testado de ponta a ponta. | Criar o bucket, preencher as variáveis `R2_*` e enviar e abrir um comprovante (checklist em [implantacao.md](implantacao.md)) |
| E-mail de recuperação de senha (Resend) | Testado só com o link saindo no log | Verificar o domínio no Resend e testar "Esqueci minha senha" |
| Neon, Render e Vercel | A imagem Docker de produção foi testada localmente: migrações, saúde, login e PDF | Fazer o primeiro deploy e rodar o checklist |
| Backup no GitHub Actions | O dump e a restauração foram testados localmente com `pg_dump` e `pg_restore` 16 | Criar o segredo `BACKUP_DATABASE_URL` e rodar o workflow uma vez |
| Testes de aceitação em homologação (16.3) | Os CA-001 a CA-022 passam nos testes automatizados e foram conferidos à mão em desenvolvimento | Montar a homologação e a T4 Trips executar os critérios |
| Leitor de tela | O axe deu zero violações e o teclado funciona | Passar as telas principais no NVDA ou no TalkBack |

## Comportamentos escolhidos (podem mudar se a T4 Trips preferir)

- **Link do passageiro aparece uma vez só.** A spec manda guardar o token só cifrado (7.1), então o sistema não consegue mostrar o mesmo link de novo. Para reenviar, gera-se um link novo e o anterior deixa de funcionar.
- **Situação financeira é calculada, não muda a reserva.** Pagar não muda a reserva para "Confirmada" sozinho. "Pago", "Atrasado" e as outras situações aparecem ao lado do status da reserva. Os valores `PARCIALMENTE_PAGA`, `PAGA` e `ATRASADA` existem no banco, mas não são usados.
- **Receita de reserva cancelada não conta** (RN-010). O dinheiro de quem cancelou e não foi reembolsado aparece à parte, como "Retido de cancelamentos".
- **No roteiro, itens sem horário aparecem antes dos que têm horário** naquele dia.
- **Remover veículo ou pousada que já teve passageiros não é possível.** Eles podem só ser desativados, para manter o histórico.

## Fora do MVP (P1 e P2 da spec)

Check-in de embarque, lembretes automáticos, WhatsApp Business API, gateway de pagamento, assinatura digital e termos, importação por planilha, aplicativo nativo, portal completo do passageiro, multiempresa. O compartilhamento por WhatsApp no MVP é o link `wa.me` ou o compartilhamento do próprio celular (9.4).

## Técnicas

- **Plano gratuito do Render:** a API dorme depois de cerca de 15 minutos parada, e o primeiro acesso seguinte demora alguns segundos. Se incomodar, o plano pago custa cerca de US$ 7 por mês.
- **Relatórios gerados na hora:** não há fila. Para a escala de uma microempresa (dezenas de passageiros) leva menos de um segundo. Com milhares de linhas, vale gerar em segundo plano (RNF-003).
- **Sessão no navegador:** os tokens de acesso ficam no `localStorage`. Isso é comum em sites assim, mas um script malicioso na página conseguiria lê-los. O risco é reduzido pelos cabeçalhos de segurança e por não haver conteúdo de terceiros. A alternativa é usar cookie `httpOnly`, o que pede ajustar o CORS.
- **Monitoramento de erros:** são os logs do Render e da Vercel. Não há Sentry nem alertas por e-mail.
- **Atualização em tempo real:** quem está com a tela aberta vê as mudanças de outra pessoa ao recarregar ou voltar para a aba, não na hora.
- **Editor de layout de assentos:** é o básico (grade, número, tipo, acessível, bloqueado). Arrastar e soltar é P1.
- **Cálculo do simulador duplicado:** a mesma conta existe no site (para responder na hora) e na API (que grava). Um teste garante que as duas sigam iguais.
- **Logo e ícones:** o logo é provisório, em texto. Os ícones do app (`public/icon-*.png`) e o `favicon.ico` vieram da base do projeto e precisam ser trocados pelos da T4 Trips.
- **Prisma 5:** o Prisma mostra aviso de versão nova (major). Atualizar é uma tarefa à parte, com testes.
