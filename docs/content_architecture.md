# ARQUITETURA DE CONTEÚDO DO PORTAL CHRONUS
## FASE 2B — MODELO DE DADOS, STORAGE AUDITADO & SEGURANÇA RLS

> **Documento:** Especificação Técnica de Backend, Armazenamento e Segurança  
> **Sistema:** CHRONUS — Ecologia Sobrenatural  
> **Versão da Arquitetura:** 4.0 (Preflight Gate de Segurança Aprovado)  
> **Status:** Pronto para Revisão (Nenhum SQL executado)

---

## 1. Diretrizes Arquiteturais & Regras Imutáveis

1. **Segregação Física Total de Segredos (1-to-1 Extensions):**
   - RLS protege linhas, não colunas.
   - Nenhuma anotação confidencial, identidade oculta, verdade mística, ganchos de sessão ou fraquezas mecânicas residem nas tabelas visíveis a jogadores (`chronicle_chapters`, `campaign_sessions`, `npcs`, `locations`, `campaign_documents`).
   - Todos os segredos residem em tabelas privadas (`chapter_secrets`, `session_secrets`, `npc_secrets`, `location_secrets`, `document_secrets`), cujo RLS restringe 100% das operações exclusivamente à role `'narrator'`.
   - Tabelas de segredos **não possuem concessão (GRANT) para anônimos**.

2. **Storage 100% Privado Governado por `can_read_portal_asset()` com Derivação de Pai:**
   - Todos os 4 novos buckets (`campaign-images`, `maps`, `documents`, `library`) são **estritamente PRIVADOS (`public = false`)**.
   - O acesso a arquivos via `storage.objects` passa pela função `public.can_read_portal_asset(bucket_id, name)`.
   - Se o asset estiver vinculado a uma entidade editorial (`content_type` e `content_id`), a função valida o status da entidade pai. Se a entidade pai estiver como rascunho (`published = false`) ou for de visibilidade restrita (`visibility = 'narrator'`), o download do arquivo é **automaticamente bloqueado pelo PostgreSQL**, mesmo que o asset possua `visibility = 'public'`.
   - Assets órfãos sem correspondência em `portal_assets` sofrem **Default-Deny** (acesso bloqueado a anônimos e jogadores).
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

## 2. Matriz de Grants e RLS das Tabelas

| Tabela | anon SELECT | authenticated SELECT | RLS Habilitado | Tipo de Acesso |
| :--- | :---: | :---: | :---: | :--- |
| `chronicle_chapters` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `chapter_secrets` | ❌ **Negado** | ✅ Concedido | ✅ SIM | **Exclusivo Narrador** (RLS) |
| `campaign_sessions` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `session_secrets` | ❌ **Negado** | ✅ Concedido | ✅ SIM | **Exclusivo Narrador** (RLS) |
| `npcs` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `npc_secrets` | ❌ **Negado** | ✅ Concedido | ✅ SIM | **Exclusivo Narrador** (RLS) |
| `locations` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `location_secrets` | ❌ **Negado** | ✅ Concedido | ✅ SIM | **Exclusivo Narrador** (RLS) |
| `campaign_documents` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `document_secrets` | ❌ **Negado** | ✅ Concedido | ✅ SIM | **Exclusivo Narrador** (RLS) |
| `soundtrack` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `library_items` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `portal_assets` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado por visibilidade & publicação |
| `session_npcs` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (Sessão ∧ NPC) |
| `session_locations` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (Sessão ∧ Local) |
| `session_documents` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (Sessão ∧ Doc) |
| `chapter_npcs` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (Capítulo ∧ NPC) |
| `chapter_locations`| ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (Capítulo ∧ Local) |
| `npc_locations` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (NPC ∧ Local) |
| `npc_documents` | ✅ Permitido | ✅ Permitido | ✅ SIM | Filtrado bilateralmente (NPC ∧ Doc) |

---

## 3. Matriz de Segurança Conceitual e Provas de Consulta

### 3.1. Sessão `players` + `session_secrets`
- **Jogador (`role = 'player'`):**
  - Consulta `SELECT * FROM campaign_sessions;` $	o$ ✅ Retorna a sessão.
  - Consulta `SELECT * FROM session_secrets WHERE session_id = '...';` $	o$ ❌ **0 linhas** (bloqueado por RLS).
- **Narrador (`role = 'narrator'`):**
  - Consulta com join em `session_secrets` $	o$ ✅ Retorna sessão + anotações, ganchos e consequências ocultas.

### 3.2. Conteúdo `narrator` + Asset com Drift de Marcação (`visibility = 'public'`)
- **Cenário:** O registro em `portal_assets` aponta para `content_type = 'npc'` e `content_id = '<uuid>'`, mas o NPC está com `visibility = 'narrator'`.
- **Anônimo / Jogador:** A função `can_read_portal_asset()` consulta a tabela `npcs` pelo `content_id`. Como a consulta ao NPC falha na condição de visibilidade do leitor, a função retorna `false`.
- **Resultado:** ❌ **HTTP 403 Forbidden** (Impossível baixar o arquivo).

### 3.3. Asset apontando para `content_id` Inexistente ou Incoerente
- **Cenário:** `content_id` é um UUID que não existe na tabela pai ou combinação de tipos inválida.
- **Anônimo / Jogador:** A subquery da função `can_read_portal_asset()` retorna `false`.
- **Resultado:** ❌ **Default-Deny** (Acesso bloqueado por padrão).

### 3.4. Asset Independente (`content_id IS NULL`), `public` e Publicado
- **Cenário:** Capa oficial do portal ou logotipo cadastrado como asset independente com `visibility = 'public'` e `published = true`.
- **Anônimo:** `can_read_portal_asset()` valida diretamente a linha de `portal_assets`.
- **Resultado:** ✅ **Download Autorizado**.

---

## 4. Plano de Contingência e Rollback Conservador
- O script `supabase/migrations/001_portal_content_rollback.sql` remove exclusivamente os recursos criados na migração 001.
- **Preservação de Dados:** O rollback **NÃO** executa `DELETE FROM storage.objects`. Buckets que contenham arquivos são preservados para que a exclusão de mídia seja uma decisão administrativa consciente.
