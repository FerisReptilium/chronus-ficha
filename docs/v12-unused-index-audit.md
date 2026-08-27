# CHRONUS v1.2 — Auditoria de `unused_index`

Data da auditoria: 2026-08-27

## Objetivo

Revisar os índices marcados pelo Supabase Advisor como `unused_index` usando evidência real de produção, sem remover nenhum índice automaticamente. Esta auditoria é somente diagnóstica e segue o critério da issue #3: um índice não deve ser removido apenas porque o linter ainda não registrou uso.

## Evidências consultadas

- `pg_stat_user_indexes` / `pg_stat_user_tables` em produção.
- Definições reais em `pg_indexes`.
- Janela atual de estatísticas do PostgreSQL: `stats_reset = 2026-07-24 08:28:18+00`.
- `pg_stat_statements` em produção para identificar as consultas realmente executadas.
- Serviço read-only `js/services/content.js`, que hoje lista entidades ordenando principalmente por `sort_order` e uma segunda chave estável.
- Migration `001_portal_content.sql`, para identificar índices explicitamente planejados para RLS, listing, slug e filtros futuros.

## Contexto importante

No momento da auditoria, as tabelas afetadas estavam sem linhas vivas persistentes (`n_live_tup = 0`) após os ciclos de QA. Todos os índices marcados pelo advisor tinham `idx_scan = 0` e ocupavam apenas 8–16 kB. Portanto, `idx_scan = 0` sozinho não é evidência suficiente para remoção.

O `pg_stat_statements` mostra uso real e repetido das listagens de `campaign_sessions`, `campaign_documents`, `locations`, `npcs`, `library_items` e `soundtrack`, normalmente com `ORDER BY sort_order` e uma segunda chave. Também mostra que `portal_assets` é consultada principalmente por `(content_type, content_id)` e por `(bucket_id, object_path)`, cobertos por outros índices dedicados.

## Resultado por índice

| Índice | Estrutura | Evidência atual | Decisão v1.2 |
|---|---|---|---|
| `idx_campaign_sessions_number` | `(session_number)` | Existe `campaign_sessions_session_number_key`, UNIQUE, na mesma coluna. Duplicação estrutural clara. | **Candidato forte à remoção futura**, sem remover agora. |
| `idx_campaign_sessions_date` | `(session_date)` | Nenhuma consulta corrente filtrando ou ordenando por `session_date`; campo hoje é apenas selecionado/gravado. | **Manter e observar**. Pode ser útil quando houver filtro cronológico real. |
| `idx_campaign_sessions_listing` | `(visibility, published, published_at, sort_order)` | Alinha com a semântica de publicação/RLS e com a listagem por `sort_order`; falta massa de dados para o planner escolhê-lo. | **Manter**. Índice estratégico para crescimento. |
| `idx_npcs_listing` | `(visibility, published, published_at, sort_order)` | Mesmo padrão das listagens editoriais e RLS. | **Manter**. |
| `idx_locations_slug` | `(slug)` | Existe `locations_slug_key`, UNIQUE, na mesma coluna. Duplicação estrutural clara. | **Candidato forte à remoção futura**, sem remover agora. |
| `idx_locations_type` | `(type)` | O frontend atual carrega os locais e não faz filtro SQL por `type`; o tipo é usado na apresentação. | **Manter e observar**. Pode suportar filtro de atlas no futuro. |
| `idx_locations_listing` | `(visibility, published, published_at, sort_order)` | Coerente com RLS/publicação e ordenação editorial. | **Manter**. |
| `idx_campaign_documents_slug` | `(slug)` | Existe `campaign_documents_slug_key`, UNIQUE, na mesma coluna. Duplicação estrutural clara. | **Candidato forte à remoção futura**, sem remover agora. |
| `idx_campaign_documents_type` | `(type)` | Não há filtro SQL corrente por `type`; tipo é metadado editorial. | **Manter e observar**. |
| `idx_campaign_documents_listing` | `(visibility, published, published_at, sort_order)` | Alinha com RLS/publicação e listagem por `sort_order`. | **Manter**. |
| `idx_soundtrack_listing` | `(category, visibility, published, sort_order)` | A listagem corrente não filtra por `category`, então a primeira coluna limita o uso para o fluxo atual. Pode ser útil se o filtro por categoria for introduzido. | **Manter e observar / possível redesenho futuro**. |
| `idx_library_items_slug` | `(slug)` | Existe `library_items_slug_key`, UNIQUE, na mesma coluna. Duplicação estrutural clara. | **Candidato forte à remoção futura**, sem remover agora. |
| `idx_library_items_listing` | `(category, visibility, published, sort_order)` | A listagem atual não filtra por `category`; índice foi desenhado para catálogo categorizado futuro. | **Manter e observar / possível redesenho futuro**. |
| `idx_portal_assets_access` | `(visibility, published, published_at)` | Os lookups atuais de asset são dominados por `(content_type, content_id)` e `(bucket_id, object_path)`, cobertos por `idx_portal_assets_content` e `uq_portal_assets_bucket_path`. Ainda pode ajudar em cenários de leitura por publicação/visibilidade. | **Manter e observar**. Não há evidência suficiente para remoção. |

## Classificação final

### 1. Redundância estrutural comprovada — 4 índices

Estes quatro são os únicos candidatos com evidência forte já nesta auditoria, porque uma UNIQUE B-tree equivalente já cobre a mesma coluna:

- `idx_campaign_sessions_number`
- `idx_locations_slug`
- `idx_campaign_documents_slug`
- `idx_library_items_slug`

Nenhum foi removido nesta etapa.

### 2. Índices estratégicos de listing/RLS — manter — 5 índices

- `idx_campaign_sessions_listing`
- `idx_npcs_listing`
- `idx_locations_listing`
- `idx_campaign_documents_listing`
- `idx_portal_assets_access`

O fato de ainda não terem sido escolhidos pelo planner é compatível com as tabelas vazias e o volume atual muito pequeno.

### 3. Índices de filtro/futuro — observar — 5 índices

- `idx_campaign_sessions_date`
- `idx_locations_type`
- `idx_campaign_documents_type`
- `idx_soundtrack_listing`
- `idx_library_items_listing`

Não há justificativa suficiente para removê-los no fechamento da v1.2. Para `soundtrack` e `library_items`, o prefixo `category` merece nova avaliação quando existir volume real e filtros de categoria no backend.

## Achado adicional

A migration 001 também criou alguns índices não listados atualmente pelo advisor que são estruturalmente semelhantes a UNIQUE indexes, por exemplo índices explícitos de `slug`. O fato de alguns deles não aparecerem como `unused` não significa que a duplicação estrutural deixe de existir: o PostgreSQL pode escolher um dos dois índices equivalentes e registrar scans apenas em um deles. Esse tema deve ser tratado em uma auditoria separada de **duplicate indexes**, não misturado automaticamente com o lint `unused_index`.

## Decisão de gate

Para a v1.2, a recomendação é **não criar migration de remoção de índices agora**. O advisor de `unused_index` passa a ser considerado **revisado com evidência** e não bloqueante.

Se for desejada uma limpeza posterior, o caminho mais seguro é uma migration específica e pequena contendo apenas os quatro índices com redundância estrutural comprovada, testada primeiro em ambiente descartável e aplicada em produção somente após autorização explícita.
