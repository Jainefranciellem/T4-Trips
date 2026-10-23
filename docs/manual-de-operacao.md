# Manual de operação · T4 Trips Manager

Guia para a equipe da T4 Trips usar o sistema no dia a dia. Funciona no celular, no tablet e no computador.

## Quem pode o quê

| Perfil | Pode | Não pode |
| --- | --- | --- |
| **Administrador** | Tudo: viagens, usuários, veículos, pousadas, financeiro, estornos, revogar links, LGPD | — |
| **Operador** | Clientes, passageiros, assentos, quartos, roteiro, registrar pagamento, relatórios operacionais | Ver o financeiro da viagem, estornar, criar viagem, gerenciar usuários |
| **Financeiro** | Pagamentos, estornos, reembolsos, despesas, dashboard, simulador, relatórios financeiros | Mexer em assentos e quartos, gerenciar usuários |
| **Visualizador** | Consultar as viagens liberadas para ele | Alterar qualquer coisa; ver CPF, contatos e valores (salvo se o admin liberar dados pessoais) |

O Administrador vê todas as viagens. Os demais só veem as viagens em que foram incluídos, em Viagem → Configurações da viagem → Equipe com acesso, com acesso de "Operar" ou de "Só visualizar".

## Primeiro acesso

1. Entre com o e-mail e a senha recebidos. Se esquecer a senha, use "Esqueci minha senha": o link chega no e-mail e vale por 1 hora.
2. Depois de 5 senhas erradas seguidas, a conta fica bloqueada por 15 minutos.
3. O Administrador cadastra a equipe em **Usuários**.

## Preparar uma viagem

1. **Minhas Trips → Nova viagem.** Preencha nome, destino, saída e retorno, local de embarque, capacidade e valor do pacote.
   - "Reserva pendente ocupa vaga": se ligado, pré-reservas e reservas ainda não confirmadas seguram lugar.
   - "Liberar a vaga sozinho quando a pré-reserva vencer": use junto com a validade da pré-reserva, em horas.
   - "Lista de espera quando lotar": se ligado, quem chega depois de lotar entra na fila.
2. **Roteiro:** adicione as atividades de cada dia. Itens marcados como internos não aparecem para o passageiro.
3. **Transporte e assentos → Adicionar veículo.** Os veículos são cadastrados uma vez em **Veículos** e reaproveitados nas viagens.
4. **Pousadas e quartos → Adicionar pousada.** Marque os quartos que serão usados. As pousadas também são cadastradas uma vez em **Pousadas**.
5. **Simulador de preços:** use "Usar dados da viagem" para trazer as despesas lançadas e veja o preço sugerido. Com "Usar R$ … no pacote", ele vira o preço padrão da viagem.
6. Quando estiver tudo pronto, edite a viagem e mude o status para **Aberta para reservas**.

## Adicionar um passageiro

1. **Passageiros → Adicionar passageiro.** Busque o cliente pelo nome ou use "Cadastrar novo cliente".
   - Se o cliente já existe, use o cadastro dele; não crie outro. O sistema avisa quando o CPF repete ou quando o nome e o telefone são parecidos com os de outro cliente.
   - Para menor de idade, o nome do responsável é obrigatório.
2. Escolha o status (pré-reserva, reservada, confirmada), o valor, o desconto ou acréscimo, se é cortesia, e o prazo de pagamento.
3. Ao salvar, abre o **link do passageiro**. Envie na hora pelo WhatsApp ou copie.
   - O link não fica guardado no sistema. Para mandar de novo depois, use Ações → Gerar novo link; o link anterior para de funcionar.
4. **Assento:** em Transporte e assentos, toque no nome em "Sem assento" e depois no assento.
5. **Quarto:** em Pousadas e quartos, toque no nome em "Sem quarto" e depois em "Colocar aqui". Para várias pessoas de uma vez, use "Adicionar hóspede" e "Colar lista".
   - Se o passageiro tem família ou grupo cadastrado, o sistema sugere colocar todos no mesmo quarto.

Se a viagem lotar, o sistema oferece a lista de espera. Quando abrir uma vaga, edite a reserva da pessoa da lista e mude o status para Reservada ou Confirmada.

## Registrar um pagamento

1. **Pagamentos →** clique no passageiro (ou, em Passageiros, use Ações → Pagamentos).
2. Para dividir em parcelas: **Parcelar**, escolha a quantidade e o primeiro vencimento, depois **Dividir** e **Salvar**.
3. Em **Registrar pagamento**, informe valor, data, forma e identificador. Anexe o comprovante (PDF ou foto, até 5 MB) e salve.
4. O saldo e a situação (pendente, parcialmente pago, pago, atrasado) se atualizam na hora. Uma parcela vencida e não paga marca o passageiro como **Atrasado**.
5. **Estorno** (Admin e Financeiro): no lançamento, toque em ↶ e informe o motivo. O lançamento continua no histórico, riscado.
6. **Reembolso:** primeiro cancele a reserva. Depois, em Pagamentos, abra o passageiro e use "Registrar reembolso".

## Despesas

1. **Despesas → Nova despesa.** Informe categoria, descrição, fornecedor, valor previsto e vencimento.
   - Use "Custo por passageiro" para gastos que dependem de quantas pessoas vão, como diárias e café. Esse tipo entra no cálculo do ponto de equilíbrio.
2. Clique na despesa para registrar pagamentos parciais ou o total, com comprovante.
3. **Dashboard financeiro** mostra receita prevista e recebida, despesas, lucro, margem e quantos pagantes faltam para empatar.

## Cancelar

- **Uma reserva:** Passageiros → Ações → Cancelar reserva, com motivo. O assento e o quarto são liberados e o link do passageiro para de abrir. Os pagamentos continuam no histórico.
- **A viagem inteira:** menu ⋮ da viagem → Cancelar viagem. Todas as reservas são canceladas junto.

## Encerrar a viagem

1. Edite a viagem e mude o status para **Concluída**.
2. Confira pagamentos e despesas e gere os relatórios finais: Financeiro, Lucro e Inadimplentes.
3. A viagem continua disponível para consulta em Minhas Trips → Concluídas. Só o Administrador ainda consegue editá-la.

## Relatórios

Em **Relatórios**, cada relatório sai em **PDF** (abre numa aba, pronto para imprimir), **Excel** ou **CSV**.

- **Operacionais:** lista geral, por veículo, por assento, de embarque, por pousada, por quarto e roteiro.
- **Financeiros** (Admin e Financeiro): pagamentos, inadimplentes, despesas, financeiro e lucro.
- Todo PDF traz a data, quem gerou e os filtros usados.
- A lista de embarque mostra o CPF mascarado (•••.•••.•••-25), porque vai impressa.

## Dados pessoais (LGPD)

- **Quem vê:** CPF, telefone e e-mail aparecem só para quem pode ver dados pessoais. O link do passageiro nunca mostra esses dados.
- **Pedido do titular:** quando um cliente pedir seus dados, o Administrador abre o cliente → aba **Privacidade** → "Exportar dados". Sai um arquivo com tudo o que está guardado.
- **Pedido para apagar:** na mesma aba, use "Anonimizar". Nome, CPF e contatos são apagados de forma definitiva, e os valores pagos continuam nos relatórios sem identificar a pessoa. Só é possível se o cliente não tiver viagem em aberto.
- **Regra geral:** nada é apagado de verdade no uso normal. Clientes são arquivados, reservas e despesas são canceladas, e pagamentos são estornados.

## Dúvidas comuns

- **"O link do passageiro não abre":** ele pode ter sido revogado, gerado de novo ou a reserva foi cancelada. Gere um novo link.
- **"Não consigo colocar no assento":** o assento está ocupado ou bloqueado, ou o veículo chegou à capacidade operacional. Isso pode ser ajustado em Editar veículo.
- **"O sistema demorou no primeiro acesso do dia":** é normal no plano gratuito; a API acorda em alguns segundos.
