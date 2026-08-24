# ARQUITETURA DE CONTEÚDO DO PORTAL CHRONUS
## FASE 2B — MODELO DE DADOS & SEGURANÇA RLS

> **Documento:** Especificação Técnica de Backend e Dados  
> **Sistema:** CHRONUS — Ecologia Sobrenatural  
> **Versão da Arquitetura:** 1.0  
> **Status:** Proposta para Revisão (Nenhum SQL executado)

---

## 1. Princípios Arquiteturais e Diretrizes Fundamentais

1. **Segregação Física Estrita de Segredos (1-to-1 Extensions):**
   - O Row Level Security (RLS) do PostgreSQL protege linhas inteiras, não colunas isoladas.
   - Nenhuma anotação, identidade oculta, enigma ou verdade sobrenatural exclusiva do Narrador é armazenada na mesma linha ou tabela de dados acessíveis a jogadores.
   - Entidades com segredos utilizam tabelas privadas acopladas (`npc_secrets`, `location_secrets`, `document_secrets`), acessíveis **estritamente pela role `'narrator'`**. O navegador do jogador nunca recebe ou trafega esses dados.

2. **Modelo de Visibilidade em 3 Níveis:**
   - Cada registro editorial público/jogador possui o campo:  
     `visibility TEXT NOT NULL DEFAULT 'players' CHECK (visibility IN ('public', 'players', 'narrator'))`
   - **Anônimo:** Acessa somente `visibility = 'public'` com `published = true`.
   - **Jogador (`player`):** Acessa `visibility IN ('public', 'players')` com `published = true`.
   - **Narrador (`narrator`):** Acessa todos os registros (`public`, `players`, `narrator`), inclusive rascunhos (`published = false`) e todas as tabelas de segredos.

3. **Decisão sobre Relacionamentos: Junction Tables Tipadas:**
   - Em vez de uma tabela polimórfica genérica (`content_relations`), foram adotadas **Junction Tables Tipadas Específicas** (`session_npcs`, `session_locations`, `session_documents`, `chapter_npcs`, etc.).
   - **Justificativa:** Integridade referencial real via `FOREIGN KEY ... ON DELETE CASCADE`, índices otimizados por chave estrangeira, queries aninhadas nativas no cliente Supabase PostgREST (`.select('*, session_npcs(npcs(*))')`) e simplificação das políticas de RLS.

4. **100% de Compatibilidade Aditiva:**
   - Nenhuma tabela, trigger, constraint ou policy existente (`characters`, `profiles`, bucket `portraits`) é modificada ou excluída.

---

## 2. Diagrama Entidade-Relacionamento

```text
+-----------------------+           +-----------------------+
|  chronicle_chapters   |           |   campaign_sessions   |
+-----------------------+           +-----------------------+
| id (PK, UUID)         |           | id (PK, UUID)         |
| chapter_number (INT)  |           | session_number (INT)  |
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

## 3. Especificação das Tabelas

### 3.1. Crônica & Capítulos (`chronicle_chapters`)
Registra os grandes arcos, prólogos e capítulos que compõem a narrativa global.

- `id`: UUID, Chave Primária (`gen_random_uuid()`).
- `chapter_number`: INT NOT NULL (ex: 0 para Prólogo, 1 para Capítulo I, etc.).
- `title`: TEXT NOT NULL.
- `subtitle`: TEXT.
- `slug`: TEXT NOT NULL UNIQUE (usado nas rotas do portal: `#/chronicle/capitulo-1`).
- `summary`: TEXT (sinopse pública exibida nos cards).
- `content`: TEXT NOT NULL (corpo do texto em Markdown).
- `cover_image_path`: TEXT (caminho no bucket `campaign-images`).
- `visibility`: TEXT NOT NULL DEFAULT `'public'` (`'public'`, `'players'`, `'narrator'`).
- `sort_order`: INT NOT NULL DEFAULT 0.
- `published`: BOOLEAN NOT NULL DEFAULT false.
- `published_at`: TIMESTAMPTZ.
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.2. Diário de Sessões (`campaign_sessions`)
Registra os relatórios de jogo mesa a mesa.

- `id`: UUID, Chave Primária.
- `session_number`: INT NOT NULL UNIQUE (ex: 1, 2, 3...).
- `title`: TEXT NOT NULL.
- `slug`: TEXT NOT NULL UNIQUE (ex: `sessao-01-o-despertar`).
- `session_date`: DATE (data em que a sessão ocorreu no mundo real).
- `in_game_date`: TEXT (data cronológica dentro do universo de RPG, ex: "12 de Outubro de 1998").
- `summary`: TEXT NOT NULL.
- `events_log`: TEXT (acontecimentos detalhados da sessão).
- `clues_uncovered`: TEXT (pistas e descobertas do grupo).
- `cover_image_path`: TEXT.
- `status`: TEXT NOT NULL DEFAULT `'completed'` (`'planned'`, `'in_progress'`, `'completed'`, `'canceled'`).
- `visibility`: TEXT NOT NULL DEFAULT `'players'` (`'public'`, `'players'`, `'narrator'`).
- `sort_order`: INT NOT NULL DEFAULT 0.
- `published`: BOOLEAN NOT NULL DEFAULT false.
- `published_at`: TIMESTAMPTZ.
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.3. Dossiê de NPCs (`npcs` + `npc_secrets`)

#### Tabela `npcs` (Pública / Jogadores):
- `id`: UUID, Chave Primária.
- `name`: TEXT NOT NULL.
- `slug`: TEXT NOT NULL UNIQUE.
- `portrait_path`: TEXT (caminho no bucket `campaign-images`).
- `role_occupation`: TEXT (ex: "Detetive de Homicídios", "Curador do Museu").
- `faction`: TEXT (Afiliação aparente ou Tradição).
- `apparent_age`: TEXT.
- `public_description`: TEXT.
- `known_personality`: TEXT.
- `status`: TEXT NOT NULL DEFAULT `'alive'` (`'alive'`, `'dead'`, `'missing'`, `'unknown'`, `'transformed'`).
- `relationship_to_group`: TEXT (ex: "Aliado", "Antagonista", "Neutro", "Contato", "Mentor").
- `first_appearance_session_id`: UUID REFERENCES `campaign_sessions(id)` ON DELETE SET NULL.
- `last_appearance_session_id`: UUID REFERENCES `campaign_sessions(id)` ON DELETE SET NULL.
- `visibility`: TEXT NOT NULL DEFAULT `'players'`.
- `sort_order`: INT NOT NULL DEFAULT 0.
- `published`: BOOLEAN NOT NULL DEFAULT false.
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

#### Tabela `npc_secrets` (1-to-1 Privada — SOMENTE NARRADOR):
- `id`: UUID, Chave Primária.
- `npc_id`: UUID NOT NULL UNIQUE REFERENCES `npcs(id)` ON DELETE CASCADE.
- `true_identity`: TEXT (Nome verdadeiro, avatar desperto ou natureza oculta).
- `true_faction`: TEXT (Lealdade secreta real).
- `agenda`: TEXT (Motivações ocultas e planos de curto/longo prazo).
- `secrets`: TEXT (Segredos reveláveis aos jogadores).
- `narrator_notes`: TEXT (Estatísticas, resistências, fraquezas mecânicas, ganchos de cena).
- `hidden_status`: TEXT (Status real caso forjado perante os jogadores).
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.4. Atlas de Mapas & Locais (`locations` + `location_secrets`)

#### Tabela `locations` (Pública / Jogadores):
- `id`: UUID, Chave Primária.
- `name`: TEXT NOT NULL.
- `slug`: TEXT NOT NULL UNIQUE.
- `type`: TEXT NOT NULL (`'city'`, `'district'`, `'building'`, `'bunker'`, `'club'`, `'facility'`, `'supernatural_domain'`, `'battlemap'`, `'other'`).
- `district_region`: TEXT (ex: "Centro Histórico", "Zona Portuária").
- `narrative_address`: TEXT (ex: "Rua das Acácias, 104 - Fundos").
- `public_description`: TEXT.
- `image_path`: TEXT.
- `map_image_path`: TEXT (caminho no bucket `maps`).
- `parent_location_id`: UUID REFERENCES `locations(id)` ON DELETE SET NULL (para aninhamento de locais).
- `visibility`: TEXT NOT NULL DEFAULT `'players'`.
- `sort_order`: INT NOT NULL DEFAULT 0.
- `published`: BOOLEAN NOT NULL DEFAULT false.
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

#### Tabela `location_secrets` (1-to-1 Privada — SOMENTE NARRADOR):
- `id`: UUID, Chave Primária.
- `location_id`: UUID NOT NULL UNIQUE REFERENCES `locations(id)` ON DELETE CASCADE.
- `narrator_notes`: TEXT.
- `hidden_features`: TEXT (Passagens secretas, cofres, armadilhas, defesas).
- `supernatural_truth`: TEXT (Ressonância mística, Nós de mana, manifestações do Paradoxo).
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.5. Arquivos da Crônica / Evidências (`campaign_documents` + `document_secrets`)

#### Tabela `campaign_documents` (Pública / Jogadores):
- `id`: UUID, Chave Primária.
- `title`: TEXT NOT NULL.
- `slug`: TEXT NOT NULL UNIQUE.
- `type`: TEXT NOT NULL (`'photograph'`, `'letter'`, `'report'`, `'newspaper_clipping'`, `'official_record'`, `'clue'`, `'artifact'`, `'audio_log'`, `'other'`).
- `narrative_date`: TEXT (ex: "18 de Novembro de 1989").
- `public_description`: TEXT.
- `transcription`: TEXT (transcrição do documento para facilitar leitura e acessibilidade).
- `image_path`: TEXT (caminho no bucket `documents`).
- `file_path`: TEXT (PDF ou anexo no bucket `documents`).
- `found_in_session_id`: UUID REFERENCES `campaign_sessions(id)` ON DELETE SET NULL.
- `visibility`: TEXT NOT NULL DEFAULT `'players'`.
- `sort_order`: INT NOT NULL DEFAULT 0.
- `published`: BOOLEAN NOT NULL DEFAULT false.
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

#### Tabela `document_secrets` (1-to-1 Privada — SOMENTE NARRADOR):
- `id`: UUID, Chave Primária.
- `document_id`: UUID NOT NULL UNIQUE REFERENCES `campaign_documents(id)` ON DELETE CASCADE.
- `narrator_notes`: TEXT.
- `hidden_meaning`: TEXT (Criptografia, mensagens em tinta invisível, marcas de água).
- `solution_translation`: TEXT (Tradução da língua arcaica ou solução do enigma).
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.6. Trilha Sonora (`soundtrack`)
- `id`: UUID, Chave Primária.
- `title`: TEXT NOT NULL.
- `youtube_url`: TEXT NOT NULL.
- `category`: TEXT NOT NULL (`'theme'`, `'investigation'`, `'horror'`, `'combat'`, `'suspense'`, `'epilogue'`, `'ambient'`).
- `description`: TEXT.
- `sort_order`: INT NOT NULL DEFAULT 0.
- `active`: BOOLEAN NOT NULL DEFAULT true.
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.7. Biblioteca CHRONUS (`library_items`)
- `id`: UUID, Chave Primária.
- `title`: TEXT NOT NULL.
- `slug`: TEXT NOT NULL UNIQUE.
- `category`: TEXT NOT NULL (`'system_book'`, `'pocket_manual'`, `'quick_guide'`, `'character_sheet'`, `'supplement'`, `'extra'`).
- `version`: TEXT NOT NULL DEFAULT `'1.0'`.
- `description`: TEXT.
- `cover_path`: TEXT (caminho no bucket `library`).
- `file_path`: TEXT NOT NULL (PDF no bucket `library`).
- `file_size_bytes`: BIGINT.
- `page_count`: INT.
- `sort_order`: INT NOT NULL DEFAULT 0.
- `visibility`: TEXT NOT NULL DEFAULT `'public'`.
- `published_at`: TIMESTAMPTZ NOT NULL DEFAULT now().
- `created_by`: UUID REFERENCES `auth.users(id)` ON DELETE SET NULL.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now().

---

### 3.8. Junction Tables Tipadas de Relacionamento
Garantem integridade relacional nativa e permitem consultas aninhadas com `ON DELETE CASCADE`:

1. `session_npcs`: `(session_id, npc_id, role_in_session)`
2. `session_locations`: `(session_id, location_id, notes)`
3. `session_documents`: `(session_id, document_id, discovery_context)`
4. `chapter_npcs`: `(chapter_id, npc_id)`
5. `chapter_locations`: `(chapter_id, location_id)`
6. `npc_locations`: `(npc_id, location_id, association_type)`
7. `npc_documents`: `(npc_id, document_id, association_type)`

---

## 4. Arquitetura de Storage (Buckets)

| Bucket | Acesso | Limite de Tamanho | MIME Types | Estrutura de Diretórios | RLS de Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `campaign-images` | **Público** | 5 MB | Imagens (`jpg`, `png`, `webp`, `svg`) | `chapters/`, `sessions/`, `npcs/`, `locations/` | **Leitura:** Livre / **Escrita:** Somente Narrador |
| `maps` | **Público** | 15 MB | Imagens (`jpg`, `png`, `webp`, `svg`) | `districts/`, `facilities/`, `battlemaps/` | **Leitura:** Livre / **Escrita:** Somente Narrador |
| `documents` | **Público/Auth** | 20 MB | Imagens + PDFs (`pdf`, `jpg`, `png`, `webp`) | `evidence/`, `letters/`, `records/` | **Leitura:** Conforme Visibilidade / **Escrita:** Somente Narrador |
| `library` | **Público** | 50 MB | PDFs e Capas (`pdf`, `jpg`, `png`, `webp`) | `manuals/`, `guides/`, `sheets/`, `covers/` | **Leitura:** Livre / **Escrita:** Somente Narrador |
| `portraits` *(Legado)* | **Privado** | 5 MB | Imagens | `${user_id}/portrait` | *(100% Inalterado)* |

---

## 5. Exemplos de Consultas no Frontend (Supabase Client)

### 5.1. Consulta Pública/Jogador: Listar Sessões com NPCs e Locais Aninhados
```typescript
// O jogador recebe apenas dados públicos e autorizados
const { data: sessions, error } = await supabase
  .from('campaign_sessions')
  .select(`
    id, session_number, title, slug, in_game_date, summary, cover_image_path,
    session_npcs (
      npcs ( id, name, slug, portrait_path, role_occupation )
    ),
    session_locations (
      locations ( id, name, slug, type, district_region )
    )
  `)
  .order('session_number', { ascending: false });
```

### 5.2. Consulta do Narrador: NPC com seu Segredo Privado
```typescript
// Somente o Narrador autenticado recebe a linha de 'npc_secrets'
const { data: npc, error } = await supabase
  .from('npcs')
  .select(`
    *,
    npc_secrets ( true_identity, true_faction, agenda, secrets, narrator_notes )
  `)
  .eq('slug', 'agente-valmir-costa')
  .single();
```

---

## 6. Plano de Contingência e Rollback
- O arquivo `supabase/migrations/001_portal_content_rollback.sql` executa o desmonte seguro de todas as tabelas, funções auxiliares e policies criadas nesta migração.
- A migração e o rollback são **100% isolados** das tabelas legadas da ficha e dos perfis de usuário.
