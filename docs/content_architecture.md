# ARQUITETURA DE CONTEÚDO DO PORTAL CHRONUS
## FASE 2B — MODELO DE DADOS, STORAGE AUDITADO & SEGURANÇA RLS

> **Documento:** Especificação Técnica de Backend, Armazenamento e Segurança  
> **Sistema:** CHRONUS — Ecologia Sobrenatural  
> **Versão da Arquitetura:** 3.0 (Gate Final de Segurança Aprovado)  
> **Status:** Pronto para Revisão (Nenhum SQL executado)

---

## 1. Diretrizes Arquiteturais & Regras Imutáveis

1. **Segregação Física Total de Segredos (1-to-1 Extensions):**
   - RLS protege linhas, não colunas.
   - Nenhuma anotação confidencial, identidade oculta, estatística ou fraqueza mecânica reside nas tabelas visíveis a jogadores (`npcs`, `locations`, `campaign_documents`).
   - Todos os segredos residem em tabelas privadas (`npc_secrets`, `location_secrets`, `document_secrets`), cujo RLS restringe 100% das operações exclusivamente à role `'narrator'`.

2. **Storage 100% Privado Governado por `portal_assets` (Default-Deny):**
   - Todos os 4 novos buckets (`campaign-images`, `maps`, `documents`, `library`) são **estritamente PRIVADOS (`public = false`)**.
   - O download ou visualização de qualquer arquivo via `storage.objects` exige a existência de um registro publicado correspondente em `public.portal_assets`.
   - Se um arquivo estiver em `public/capa.jpg` mas seu registro em `portal_assets` possuir `published = false`, o download é **sumariamente bloqueado pelo PostgreSQL**.
   - `getPublicUrl` é **proibido** para conteúdo protegido. O acesso aos arquivos ocorre via downloads autenticados (`.download()`) ou signed URLs temporárias (`createSignedUrl(path, 3600)`).
   - O bucket legado `portraits` permanece 100% inalterado.

3. **RLS Bilateral e Blindagem em Junction Tables:**
   - As 7 tabelas de ligação (`session_npcs`, `session_locations`, `session_documents`, `chapter_npcs`, `chapter_locations`, `npc_locations`, `npc_documents`) possuem políticas que exigem que o usuário tenha permissão de leitura sobre **AMBAS as entidades conectadas**.
   - Se uma Sessão Pública estiver relacionada a um NPC com `visibility = 'narrator'`, a relação em `session_npcs` é filtrada e invisível para jogadores e anônimos.

4. **Uniformização do Ciclo Editorial:**
   - Todas as tabelas possuem `published BOOLEAN NOT NULL DEFAULT false`, `published_at TIMESTAMPTZ`, `sort_order INT NOT NULL DEFAULT 0` e `visibility` (inclusive `soundtrack`).
   - Regra de leitura para o público: `published = true AND (published_at IS NULL OR published_at <= now())`.
   - Narradores visualizam rascunhos e publicações futuras.

5. **Prólogo e Numeração Flexível:**
   - `chronicle_chapters.chapter_number` é anulável (`INT NULL`), permitindo que Prólogos (ou Capítulos Especiais) não fiquem restritos a inteiros positivos rígidos.
   - `sort_order` é a autoridade máxima de ordenação na interface.

6. **Preservação de Funções Existentes:**
   - A função `public.is_chronus_narrator()` existente em produção é **reutilizada sem modificação**.
   - A nova função `public.is_chronus_player_or_narrator()` foi criada com `SET search_path = ''` e referências totalmente qualificadas.

7. **100% de Compatibilidade Aditiva:**
   - `public.characters`, `public.profiles`, `auth.users`, bucket `portraits`, ficha v0.6.1 e o Portal Fase 2A permanecem intactos.

---

## 2. Diagrama Entidade-Relacionamento e Storage

```text
======================= STORAGE BUCKETS (PRIVADOS) =======================
  [ campaign-images ]   --> Validado contra public.portal_assets
  [ maps ]              --> Validado contra public.portal_assets
  [ documents ]         --> Validado contra public.portal_assets
  [ library ]           --> Validado contra public.portal_assets
  [ portraits (legado)] --> {user_id}/portrait (inalterado)

======================== MODELO RELACIONAL DE DADOS =======================

+-----------------------+           +-----------------------+
|     portal_assets     |           |  chronicle_chapters   |
+-----------------------+           +-----------------------+
| id (PK, UUID)         |           | id (PK, UUID)         |
| bucket_id (TEXT)      |           | chapter_number (NULL) |
| object_path (TEXT, UQ)|           | title (TEXT)          |
| content_type (TEXT)   |           | slug (TEXT, UNIQUE)   |
| content_id (UUID, FK) |           | summary (TEXT)        |
| visibility (ENUM)     |           | content (TEXT)        |
| published (BOOLEAN)   |           | cover_image_path      |
| published_at (TZ)     |           | visibility (ENUM)     |
+-----------------------+           | sort_order (INT)      |
                                    | published (BOOLEAN)   |
                                    | published_at (TZ)     |
                                    +-----------+-----------+
                                                |
    +-------------------------------------------+-----------------------------------+
    |                                                                               |
    |                                   +-----------------------+                   |
    |                                   |   campaign_sessions   |                   |
    |                                   +-----------------------+                   |
    |                                   | id (PK, UUID)         |                   |
    |                                   | session_number (INT)  |                   |
    |                                   | title (TEXT)          |                   |
    |                                   | slug (TEXT, UNIQUE)   |                   |
    |                                   | session_date (DATE)   |                   |
    |                                   | in_game_date (TEXT)   |                   |
    |                                   | summary (TEXT)        |                   |
    |                                   | events_log (TEXT)     |                   |
    |                                   | clues_uncovered (TEXT)|                   |
    |                                   | status (ENUM)         |                   |
    |                                   | visibility (ENUM)     |                   |
    |                                   +-----------+-----------+                   |
    |                                               |                               |
    +-------+-------+                   +-------+---+---+                           |
    |               |                   |       |       |                           |
+---+---+       +---+---+           +---+---+ +-+---+ +-+---+                       |
|chap_  |       |chap_  |           |sess_  | |sess_ | |sess_ |                       |
|npcs   |       |locs   |           |npcs   | |locs  | |docs  |                       |
+---+---+       +---+---+           +---+---+ +-+---+ +-+---+                       |
    |               |                   |       |       |                           |
    |               |       +-----------+       |       |                           |
    |               |       |                   |       |                           |
+---+---------------+---+   |   +---------------+---+   |   +-------------------+   |   +-------------------+
|         npcs          |   |   |     locations     |   |   |campaign_documents |   |   |     soundtrack    |
+-----------------------+   |   +-------------------+   |   +-------------------+   |   +-------------------+
| id (PK, UUID)         |   |   | id (PK, UUID)     |   |   | id (PK, UUID)     |   |   | id (PK, UUID)     |
| name (TEXT)           |<--+   | name (TEXT)       |<--+   | title (TEXT)      |   |   | title (TEXT)      |
| slug (TEXT, UNIQUE)   |       | slug (TEXT, UNIQUE)       | slug (TEXT, UNIQUE)|   |   | youtube_url (TEXT)|
| portrait_path (TEXT)  |       | type (ENUM)       |       | type (ENUM)       |   |   | category (ENUM)   |
| role_occupation (TEXT)|       | district_region   |       | narrative_date    |   |   | visibility (ENUM) |
| faction (TEXT)        |       | public_description|       | transcription     |   |   | active (BOOLEAN)  |
| public_description    |       | image_path / map  |       | image_path / file |   |   | published (BOOL)  |
| known_personality     |       | visibility (ENUM) |       | visibility (ENUM) |   |   +-------------------+
| status (ENUM)         |       +---------+---------+       +---------+---------+   |
| relationship_to_group |                 |                           |             |   +-------------------+
| visibility (ENUM)     |                 | 1:1                       | 1:1         +-->|   library_items   |
+-----------+-----------+                 v                           v                 +-------------------+
            | 1:1               +-------------------+       +-------------------+       | id (PK, UUID)     |
            v                   | location_secrets  |       |  document_secrets |       | title (TEXT)      |
+-----------------------+       | (NARRATOR ONLY)   |       |  (NARRATOR ONLY)  |       | slug (TEXT, UNIQUE)|
|      npc_secrets      |       +-------------------+       +-------------------+       | file_path (TEXT)  |
|    (NARRATOR ONLY)    |       | location_id (PK)  |       | document_id (PK)  |       | visibility (ENUM) |
+-----------------------+       | narrator_notes    |       | narrator_notes    |       | published (BOOL)  |
| npc_id (PK, FK)       |       | hidden_features   |       | hidden_meaning    |       +-------------------+
| true_identity (TEXT)  |       | supernatural_truth|       | solution_translat.|
| true_faction (TEXT)   |       +-------------------+       +-------------------+
| agenda (TEXT)         |
| secrets (TEXT)        |
| narrator_notes (TEXT) |
+-----------------------+
```

---

## 3. Matriz de Segurança Conceitual e Provas de Consulta

### 3.1. Simulação: Usuário ANÔNIMO (Não Autenticado)
1. `SELECT * FROM chronicle_chapters;`
   - ✅ Retorna capítulos com `visibility = 'public' AND published = true AND published_at <= now()`.
   - ❌ Linhas com `visibility = 'players'` ou `'narrator'` ou `published = false` **não aparecem no result set**.
2. `SELECT * FROM npcs WHERE visibility = 'narrator';`
   - ❌ Retorna **0 linhas** (bloqueado por RLS).
3. `SELECT * FROM npc_secrets;`
   - ❌ Retorna **0 linhas** (bloqueado por RLS).
4. `storage.from('documents').download('public/arquivo_rascunho.pdf')` (com `portal_assets.published = false`)
   - ❌ Retorna **HTTP 403 Forbidden** (bloqueado pelo RLS de storage).
5. `storage.from('documents').download('public/arquivo_publicado.pdf')` (com `portal_assets.published = true`)
   - ✅ Download **autorizado**.
6. `SELECT * FROM session_npcs;`
   - ✅ Retorna somente pares onde a Sessão É pública E o NPC É público. Relações com NPCs secretos são omitidas.

### 3.2. Simulação: Usuário JOGADOR (`role = 'player'`)
1. `SELECT * FROM campaign_sessions;`
   - ✅ Retorna sessões com `visibility IN ('public', 'players')` e `published = true`.
   - ❌ Não retorna sessões de rascunho ou exclusivas do Narrador.
2. `SELECT * FROM npc_secrets;`
   - ❌ Retorna **0 linhas** (bloqueado por RLS).
3. `storage.from('maps').download('players/distrito_sul.jpg')` (publicado)
   - ✅ Download autenticado autorizado com sucesso.
4. `storage.from('maps').download('narrator/bunker_oculto.jpg')`
   - ❌ Retorna **HTTP 403 Forbidden**.
5. `storage.from('maps').download('arquivo_sem_registro.jpg')`
   - ❌ Retorna **HTTP 403 Forbidden** (Default-deny por ausência em `portal_assets`).
6. `SELECT * FROM session_npcs;`
   - ✅ Retorna apenas conexões entre Sessões (public/players) e NPCs (public/players). Se a sessão tiver um NPC `narrator`, a linha da junction table **não é retornada**.

### 3.3. Simulação: NARRADOR (`role = 'narrator'`)
1. `SELECT * FROM chronicle_chapters;`
   - ✅ Retorna todos os capítulos (public, players, narrator, drafts com `published = false`).
2. `SELECT * FROM npcs JOIN npc_secrets ON npcs.id = npc_secrets.npc_id;`
   - ✅ Retorna o NPC completo com anotações, agenda, lealdades e segredos.
3. `storage.from('documents').download('narrator/evidencia_secreta.pdf')`
   - ✅ Acesso total a qualquer arquivo em qualquer prefixo (`public/`, `players/`, `narrator/`), inclusive rascunhos.
4. `INSERT / UPDATE / DELETE` em qualquer tabela ou bucket:
   - ✅ 100% autorizado.

---

## 4. Plano de Contingência e Rollback Conservador
- O script `supabase/migrations/001_portal_content_rollback.sql` remove exclusivamente os recursos criados na migração 001.
- **Preservação de Dados:** O rollback **NÃO** executa `DELETE FROM storage.objects`. Buckets que contenham arquivos são preservados para que a exclusão de mídia seja uma decisão administrativa consciente.
