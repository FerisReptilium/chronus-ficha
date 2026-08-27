# CHRONUS v1.3 — QA geral e preparação de release

Data: 2026-08-27
Branch auditada: `editorial-v1.3`
Base de produção: `main` / v1.2
Status: **RC tecnicamente apto para abertura de PR; nenhum merge/deploy executado.**

## Escopo auditado

- Home cinematográfica e seis cenas editoriais.
- Páginas internas de Crônica, Sessões, NPCs, Locais, Arquivos e Biblioteca.
- Rotas SPA e fallback de rota inválida.
- Autenticação, autorização de Narrador e logout seguro.
- RLS das tabelas principais do portal.
- Signed URLs e isolamento de cache por autenticação.
- Ficha digital isolada.
- Mobile, reduced motion e semântica básica de acessibilidade.
- Orçamento estático de assets cinematográficos.
- Smoke HTTP dos arquivos necessários ao carregamento do portal.

## Resultado por área

| Área | Resultado | Evidência/critério |
|---|---|---|
| Regressões v1.1 | PASS | suíte existente mantida no CI v1.3 |
| RLS/performance v1.2 | PASS | testes `v12_*` permanecem no gate |
| Fases v1.3 1–4F | PASS | todos os testes de fase permanecem no gate |
| Rotas SPA | PASS | 12 rotas principais possuem view correspondente |
| Player/Narrador | PASS | `authRequired` e `narratorOnly` preservados |
| Autenticação | PASS | login, recovery, update e sign-out preservados |
| Logout seguro | PASS | ficha dirty tenta sincronizar; falha cancela logout |
| Conteúdo editorial | PASS | leitura via `ChronusContent`; visibilidade/publicação continuam sob RLS |
| Assets privados | PASS | allowlist, path validation, auth epoch e signed URLs preservados |
| Arquivos/PDFs | PASS | URL de arquivo só é assinada por clique; TTL curto de 300 s |
| Ficha digital | PASS | `sheet_engine.js` e `sheet.css` idênticos ao baseline v1.2 por Git blob SHA |
| CSS cinematográfico | PASS | escopo não toca `#view-sheet`; breakpoints mobile presentes |
| Movimento | PASS | reduced-motion preservado nas camadas que possuem transições/movimento |
| Hero | PASS | WebP otimizado abaixo do orçamento de 100 KB |
| Smoke estático | PASS | servidor HTTP local + fetch dos arquivos críticos |
| Produção | NÃO ALTERADA | branch continua separada de `main` |

## Auditoria do Supabase em produção

A verificação estrutural foi somente leitura.

### RLS

RLS está habilitado nas tabelas auditadas:

- `profiles`
- `characters`
- `chronicle_chapters`
- `campaign_sessions`
- `npcs`
- `locations`
- `campaign_documents`
- `soundtrack`
- `library_items`

As tabelas editoriais mantêm política `SELECT` dedicada e políticas administrativas separadas para `INSERT`, `UPDATE` e `DELETE`, conforme hardening da v1.2.

### Security Advisor

Permanece um aviso externo já conhecido e não introduzido pela v1.3:

- **Leaked Password Protection Disabled** — proteção contra senhas comprometidas está desativada no Supabase Auth.

Não bloqueia tecnicamente o release do frontend, mas é recomendado habilitar antes ou logo após a v1.3.

### Performance Advisor

Há apenas avisos `INFO` de índices ainda sem uso observado, principalmente em tabelas editoriais atualmente com pouco ou nenhum tráfego/dado. Nenhum índice foi removido durante a v1.3. A decisão continua sendo observar uso real antes de excluir índices.

## Segurança de assets

`ChronusAssets` continua em modelo default-deny:

- buckets permitidos: `campaign-images`, `maps`, `documents`, `library`;
- rejeita URLs absolutas, caminhos absolutos, barras invertidas e segmentos `.`/`..`;
- signed URLs ficam em cache temporário em memória;
- cache é invalidado ao trocar autenticação;
- requests em voo são descartados quando o auth epoch muda.

Para documentos e biblioteca, `file_path` não é assinado no carregamento da página. A assinatura de 300 segundos acontece somente após ação explícita do usuário.

## Ficha digital

A v1.3 não alterou o motor nem o CSS principal da ficha:

- `js/modules/sheet_engine.js` preservado em relação à v1.2;
- `css/sheet.css` preservado em relação à v1.2;
- `#view-sheet` continua fora de `.portal-shell`;
- CSS cinematográfico é bloqueado pelo QA caso passe a estilizar `#view-sheet`.

## Mobile e acessibilidade

O gate final verifica:

- viewport responsivo;
- breakpoints mobile das camadas cinematográficas;
- `prefers-reduced-motion` nas páginas/efeitos com movimento;
- nomes acessíveis nos controles principais do menu;
- regiões `aria-live` para feedback;
- idioma `pt-BR` no documento.

A auditoria estrutural não substitui uma inspeção pixel a pixel em navegador real. Como a v1.3 ainda não foi publicada, esse último passe visual deve ser repetido após a criação do PR/ambiente de preview ou imediatamente após um deploy autorizado, antes de declarar produção encerrada.

## Performance

O gate final adiciona orçamento estático para impedir crescimento acidental:

- arte principal do Hero: máximo de 100 KB;
- conjunto de CSS cinematográfico: máximo de 190 KB em fonte não minificada;
- sem biblioteca de animação adicional;
- parallax usa `requestAnimationFrame`, listener passivo e movimento limitado;
- imagens editoriais continuam lazy quando renderizadas em listas internas.

## Gate final da branch

O workflow `CHRONUS v1.3 CI` agora executa:

1. syntax check de bootstrap, router, auth, content, assets, módulos internos e sheet engine;
2. regressões v1.1;
3. regressões RLS/performance v1.2;
4. testes v1.3 das Fases 1, 2A–2F, 3 e 4A–4F;
5. `tests/v13_release_qa.test.js`;
6. smoke HTTP local dos assets críticos.

## Decisão de release

**GO para abrir PR de v1.3 contra `main`, mas NO-GO para merge/deploy automático.**

O PR deve ser criado somente após autorização explícita. Depois do PR, repetir os checks no evento `pull_request`. Merge, GitHub Pages, tag `v1.3.0` e release continuam gates separados e exigem autorização explícita.
