# CHRONUS v1.6.2 — Backup de fichas

## Exportação

Na aba **Mesa de Jogadores** do Painel do Narrador:

- **Exportar ficha** baixa um JSON individual, com identidade do personagem, proprietário, revisão e data da última atualização.
- **Backup da Mesa** baixa um pacote JSON com os backups individuais das fichas existentes dos jogadores. O pacote é uma cópia de segurança, não inclui senhas, tokens de sessão nem retratos binários.

Guarde os arquivos fora do navegador, em local privado e seguro. Os JSONs contêm informações da crônica e dados pessoais que podem constar nas fichas.

## Restauração individual

1. Na ficha do jogador correto, escolha **Restaurar backup**.
2. Selecione o JSON individual correspondente àquele mesmo personagem.
3. Confira jogador, personagem e data exibidos na confirmação.
4. Confirme somente se deseja substituir os dados atuais.

A restauração valida o formato e a estrutura, limita o arquivo a 2 MB, rejeita chaves perigosas e exige correspondência exata dos IDs do personagem e do proprietário.

Antes de gravar, a aplicação compara a revisão do registro na nuvem com a revisão que o Narrador carregou. Se a ficha tiver sido alterada nesse intervalo, a restauração é recusada e os dados mais recentes permanecem intactos. A gravação é restrita ao mesmo ID de personagem, ao mesmo proprietário e à revisão esperada.

## Limites desta primeira entrega

- O pacote da mesa é exportável, mas a restauração em lote não é oferecida nesta versão. Isso evita uma operação parcialmente concluída em várias fichas sem transação atômica.
- Retratos e arquivos binários armazenados no Storage não são incorporados ao JSON.
- Não há cópia automática fora do navegador: o Narrador deve baixar e guardar os arquivos periodicamente.
- A restauração substitui os dados da ficha; faça um novo backup antes de recuperar uma versão antiga.

## Segurança e dados de produção

Este recurso não requer migration nem altera registros até que o Narrador selecione um backup individual e confirme a restauração. A operação usa a política administrativa existente e o controle otimista de revisão (CAS).
