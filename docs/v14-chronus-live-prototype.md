# CHRONUS LIVE v1.4.0 — Especificação do protótipo

## Objetivo

Validar a experiência visual de uma mesa virtual CHRONUS antes de introduzir
permissões de câmera/microfone, contratos de terceiros, custos de mídia ou novos
segredos de infraestrutura.

## Marco 1 — protótipo visual

- rota protegida `#/live`;
- exceção de preview limitada a `localhost`/`127.0.0.1` e `preview=1`;
- sala responsiva para desktop e celular;
- participante em destaque e visualização em grade;
- câmera simulada e fallback automático exclusivamente para o retrato salvo na ficha;
- quadro vazio quando o personagem ainda não possui retrato, sem arte genérica;
- indicador visual de participante falando;
- estados simulados de microfone e compartilhamento de tela;
- integração com o rolador global, ficha, arquivos e atlas;
- supressão dos docks globais sobrepostos enquanto a sala estiver aberta; o
  rolador continua acessível pelo controle integrado da sala;
- reaproveitamento do nome, identidade e retrato do usuário autenticado;
- avisos explícitos de que não existe transmissão ou gravação nesta fase.

## Fora do Marco 1

- `getUserMedia` e permissões do navegador;
- transmissão WebRTC;
- LiveKit Cloud ou servidor LiveKit próprio;
- gravação, transcrição ou transmissão pública;
- tokens de sala e segredos externos;
- novas tabelas, funções, políticas RLS ou alterações no Supabase;
- merge e deploy da branch de trabalho.

## Marco 2 — transporte real, somente após aprovação visual

1. LiveKit transporta câmera, microfone e compartilhamento de tela por SFU/TURN.
2. Uma Supabase Edge Function autenticada gera tokens curtos de sala. O segredo
   do LiveKit permanece exclusivamente no servidor.
3. Supabase Auth identifica o usuário e a função confirma sua participação na
   crônica antes de gerar o token.
4. Supabase Realtime usa canais privados para presença, rolagens, solicitações do
   Narrador e estado da cena. O vídeo não passa pelo Supabase.
5. Tabelas novas ficam no schema `public`, com grants explícitos e RLS por membro
   da sala. Nenhum objeto customizado será criado nos schemas `auth`, `storage`
   ou `realtime`.
6. O Narrador pode silenciar uma faixa, destacar participantes e remover alguém
   da sala. Nunca poderá ativar remotamente câmera ou microfone.

## Critérios para aprovação do protótipo

- câmera desligada mostra o retrato salvo na ficha ou mantém o quadro vazio;
- nome do personagem, jogador e estado de mídia permanecem legíveis;
- o layout funciona sem rolagem horizontal da página em 390 px e 1440 px;
- navegação por teclado e foco visível funcionam nos controles;
- preferência por movimento reduzido desativa animações;
- ficha digital e páginas publicadas não sofrem alteração visual;
- suíte de testes estática permanece verde;
- nenhum segredo, token real ou capacidade de captura está presente.

## Rollback

O protótipo é aditivo. O rollback consiste em remover a rota `#/live`, seus dois
links de navegação, a inicialização progressiva e os arquivos
`chronus_live_v140.js`/`chronus-live-v140.css`. O banco e a versão publicada não
são alterados.
