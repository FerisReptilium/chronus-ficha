# ARQUITETURA DE CONTEÚDO DO PORTAL CHRONUS
## FASE 2B — MODELO DE DADOS, STORAGE PRIVADO & SEGURANÇA RLS

> **Documento:** Especificação Técnica de Backend, Armazenamento e Segurança  
> **Sistema:** CHRONUS — Ecologia Sobrenatural  
> **Versão da Arquitetura:** 2.0 (Revisão Final Aprovada Conceitualmente)  
> **Status:** Pronto para Revisão (Nenhum SQL executado)

---

## 1. Diretrizes Arquiteturais & Regras Imutáveis

1. **Segregação Física Total de Segredos (1-to-1 Extensions):**
   - RLS protege linhas, não colunas.
   - Nenhuma anotação confidencial, identidade oculta, estatística ou fraqueza mecânica reside nas tabelas visíveis a jogadores (`npcs`, `locations`, `campaign_documents`).
   - Todos os segredos residem em tabelas privadas (`npc_secrets`, `location_secrets`, `document_secrets`), cujo RLS restringe 100% das operações exclusivamente à role `'narrator'`.

2. **Storage 100% Privado com Visibilidade por Subpastas:**
   - Todos os novos buckets (`campaign-images`, `maps`, `documents`, `library`) são **estritamente PRIVADOS (`public = false`)**.
   - `getPublicUrl` é **proibido** para conteúdo protegido. O acesso aos arquivos ocorre via downloads autenticados (`.download()`) ou signed URLs temporárias (`createSignedUrl(path, 3600)`).
   - Organização estrutural em subpastas raiz para decisão determinística e de alta performance de RLS no storage:
     - `<bucket>/public/...` $	o$ Acesso anônimo, jogador e narrador.
     - `<bucket>/players/...` $	o$ Acesso exclusivo a jogador autenticado e narrador.
     - `<bucket>/narrator/...` $	o$ Acesso exclusivo ao narrador.
   - O bucket legado `portraits` permanece 100% inalterado.

3. **RLS Bilateral e Blindagem em Junction Tables:**
   - As 7 tabelas de ligação (`session_npcs`, `session_locations`, `session_documents`, `chapter_npcs`, `chapter_locations`, `npc_locations`, `npc_documents`) possuem políticas que exigem que o usuário tenha permissão de leitura sobre **AMBAS as entidades conectadas**.
   - Se uma Sessão Pública estiver relacionada a um NPC com `visibility = 'narrator'`, a relação em `session_npcs` é filtrada e invisível para jogadores e anônimos.

4. **Uniformização do Ciclo Editorial:**
   - Todas as tabelas possuem `published BOOLEAN NOT NULL DEFAULT false`, `published_at TIMESTAMPTZ` e `sort_order INT NOT NULL DEFAULT 0`.
   - Regra de leitura para o público: `published = true AND (published_at IS NULL OR published_at <= now())`.
   - Narradores visualizam rascunhos e publicações futuras.

5. **Prólogo e Numeração Flexível:**
   - `chronicle_chapters.chapter_number` é anulável (`INT NULL`), permitindo que Prólogos (ou Capítulos Especiais) não fiquem restritos a inteiros positivos rígidos.
   - `sort_order` é a autoridade máxima de ordenação na interface.

6. **100% de Compatibilidade Aditiva:**
   - `public.characters`, `public.profiles`, `auth.users`, bucket `portraits`, ficha v0.6.1 e o Portal Fase 2A permanecem intactos.

---

## 2. Diagrama Entidade-Relacionamento e Storage

```text
======================= STORAGE BUCKETS (PRIVADOS) =======================
  [ campaign-images ]   --> public/..., players/..., narrator/...
  [ maps ]              --> public/..., players/..., narrator/...
  [ documents ]         --> public/..., players/..., narrator/...
  [ library ]           --> public/..., players/..., narrator/...
  [ portraits (legado)] --> {user_id}/portrait (inalterado)

======================== MODELO RELACIONAL DE DADOS =======================

+-----------------------+           +-----------------------+
|  chronicle_chapters   |           |   campaign_sessions   |
+-----------------------+           +-----------------------+
| id (PK, UUID)         |           | id (PK, UUID)         |
| chapter_number (NULL) |           | session_number (INT)  |
| title (TEXT)          |           | title (TEXT)          |
| slug (TEXT, UNIQUE)   |           | slug (TEXT, UNIQUE)   |
| summary (TEXT)        |           | session_date (DATE)   |
| content (TEXT)        |           | in_game_date (TEXT)   |
| cover_image_path      |           | summary (TEXT)        |
| visibility (ENUM)     |           | events_log (TEXT)     |
| sort_order (INT)      |           | clues_uncovered (TEXT)|
| published (BOOLEAN)   |           | status (ENUM)         |
| published_at (TZ)     |           | visibility (ENUM)     |
+-----------+-----------+           +-----------+-----------+
            |                                   |
    +-------+-------+                   +-------+-------+
    |               |                   |       |       |
+---+---+       +---+---+           +---+---+ +-+---+ +-+---+
|chap_  |       |chap_  |           |sess_  | |sess_ | |sess_ |
|npcs   |       |locs   |           |npcs   | |locs  | |docs  |
+---+---+       +---+---+           +---+---+ +-+---+ +-+---+
    |               |                   |       |       |
    |               |       +-----------+       |       |
    |               |       |                   |       |
+---+---------------+---+   |   +---------------+---+   |   +-------------------+
|         npcs          |   |   |     locations     |   |   |campaign_documents |
+-----------------------+   |   +-------------------+   |   +-------------------+
| id (PK, UUID)         |   |   | id (PK, UUID)     |   |   | id (PK, UUID)     |
| name (TEXT)           |<--+   | name (TEXT)       |<--+   | title (TEXT)      |
| slug (TEXT, UNIQUE)   |       | slug (TEXT, UNIQUE)       | slug (TEXT, UNIQUE)|
| portrait_path (TEXT)  |       | type (ENUM)       |       | type (ENUM)       |
| role_occupation (TEXT)|       | district_region   |       | narrative_date    |
| faction (TEXT)        |       | public_description|       | transcription     |
| public_description    |       | image_path / map  |       | image_path / file |
| known_personality     |       | visibility (ENUM) |       | visibility (ENUM) |
| status (ENUM)         |       +---------+---------+       +---------+---------+
| relationship_to_group |                 |                           |
| visibility (ENUM)     |                 | 1:1                       | 1:1
+-----------+-----------+                 v                           v
            | 1:1               +-------------------+       +-------------------+
            v                   | location_secrets  |       |  document_secrets |
+-----------------------+       | (NARRATOR ONLY)   |       |  (NARRATOR ONLY)  |
|      npc_secrets      |       +-------------------+       +-------------------+
|    (NARRATOR ONLY)    |       | location_id (PK)  |       | document_id (PK)  |
+-----------------------+       | narrator_notes    |       | narrator_notes    |
| npc_id (PK, FK)       |       | hidden_features   |       | hidden_meaning    |
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
4. `storage.from('documents').download('narrator/evidencia_secreta.pdf')`
   - ❌ Retorna **HTTP 403 Forbidden** (rejeitado por policy).
5. `SELECT * FROM session_npcs;`
   - ✅ Retorna somente pares onde a Sessão É pública E o NPC É público. Relações com NPCs secretos são omitidas.

### 3.2. Simulação: Usuário JOGADOR (`role = 'player'`)
1. `SELECT * FROM campaign_sessions;`
   - ✅ Retorna sessões com `visibility IN ('public', 'players')` e `published = true`.
   - ❌ Não retorna sessões de rascunho ou exclusivas do Narrador.
2. `SELECT * FROM npc_secrets;`
   - ❌ Retorna **0 linhas** (bloqueado por RLS).
3. `storage.from('maps').download('players/distrito_sul.jpg')`
   - ✅ Download autenticado autorizado com sucesso.
4. `storage.from('maps').download('narrator/bunker_oculto.jpg')`
   - ❌ Retorna **HTTP 403 Forbidden**.
5. `SELECT * FROM session_npcs;`
   - ✅ Retorna apenas conexões entre Sessões (public/players) e NPCs (public/players). Se a sessão tiver um NPC `narrator`, a linha da junction table **não é retornada**.

### 3.3. Simulação: NARRADOR (`role = 'narrator'`)
1. `SELECT * FROM chronicle_chapters;`
   - ✅ Retorna todos os capítulos (public, players, narrator, drafts com `published = false`).
2. `SELECT * FROM npcs JOIN npc_secrets ON npcs.id = npc_secrets.npc_id;`
   - ✅ Retorna o NPC completo com anotações, agenda, lealdades e segredos.
3. `storage.from('documents').download('narrator/evidencia_secreta.pdf')`
   - ✅ Acesso total a qualquer arquivo em qualquer prefixo (`public/`, `players/`, `narrator/`).
4. `INSERT / UPDATE / DELETE` em qualquer tabela ou bucket:
   - ✅ 100% autorizado.

---

## 4. Riscos Residuais e Estratégias de Mitigação

| Risco Identificado | Probabilidade | Impacto | Mitigação Arquitetural Implementada |
| :--- | :---: | :---: | :--- |
| **Vazamento de Segredos por Join no Frontend** | Nula | Crítico | Segredos físicos em tabelas separadas 1-to-1 com RLS restrito a `is_chronus_narrator()`. Mesmo se o frontend solicitar `select('*, npc_secrets(*)')`, o Supabase retornará `npc_secrets: null` para jogadores. |
| **Vazamento de Relacionamentos por Junction Tables** | Nula | Alto | RLS bilateral em todas as junction tables validando que o usuário tenha acesso a ambos os lados da relação (`EXISTS ... s.id` AND `EXISTS ... n.id`). |
| **Acesso Indevido a Arquivos por URL Pública** | Nula | Alto | Todos os 4 novos buckets foram configurados como **estritamente PRIVADOS (`public = false`)**. O acesso exige token JWT ou signed URLs de curta duração geradas com validação de role. |
| **Deleção Acidental de Conta de Usuário** | Baixa | Médio | Todas as colunas `created_by` utilizam `ON DELETE SET NULL`, garantindo que o acervo editorial nunca seja destruído por exclusão de um perfil de usuário. |
