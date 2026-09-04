-- CHRONUS v1.4.3 — Briefing dinâmico da Área do Jogador
-- Acrescenta somente o objetivo público da sessão. As políticas RLS já
-- existentes em campaign_sessions continuam sendo a autoridade de acesso.

alter table public.campaign_sessions
  add column if not exists current_objective text;

comment on column public.campaign_sessions.current_objective is
  'Objetivo atual liberado pelo Narrador para os jogadores nesta sessão.';

-- A Área do Jogador filtra por status e ordena por data/número. O índice
-- parcial permanece pequeno porque ignora sessões canceladas e rascunhos.
create index if not exists idx_campaign_sessions_player_briefing
  on public.campaign_sessions (status, session_date, session_number)
  where published = true
    and status in ('planned', 'in_progress', 'completed');
