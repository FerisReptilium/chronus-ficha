# CHRONUS v1.3 — Auditoria visual da Home antes da Fase 3

Data: 2026-08-27
Branch: `editorial-v1.3`
Escopo: Home cinematográfica (Hero + Crônica + Sessões + NPCs + Locais + Arquivos + Biblioteca)

## Objetivo

Revisar a sequência editorial completa antes de adicionar movimento, procurando quatro classes de risco: ritmo vertical excessivo, repetição visual, comportamento mobile e efeitos que possam prejudicar desempenho/acessibilidade.

## Achados

### 1. Ritmo vertical excessivo — corrigir na Fase 3

As seis cenas foram criadas de forma independente e acumulam `min-height` grandes. Isoladamente isso produz impacto, mas em sequência deixa a Home mais longa do que precisa. A correção será feita por uma camada central de ritmo, sem reescrever os CSS de cada fase.

Decisão:
- reduzir moderadamente alturas mínimas das cenas;
- preservar o Hero como momento de maior escala;
- compactar principalmente Locais, Arquivos e Biblioteca;
- reduzir alturas novamente em telas menores.

### 2. Seção editorial legada permanece após a promoção dos seis cards — corrigir

Os seis cards originais são ocultados quando suas cenas cinematográficas são montadas, mas o cabeçalho da antiga seção editorial continua no DOM e pode aparecer sozinho entre a Biblioteca e o rodapé.

Decisão:
- esconder a seção editorial legada somente quando todas as seis cenas estiverem montadas com sucesso;
- manter o fallback intacto caso alguma etapa da montagem falhe.

### 3. Repetição do mesmo asset de Berlim — reduzir

O asset `hero-berlin-1992.webp` é intencionalmente forte no Hero e funciona bem como continuidade na Crônica, mas também estava sendo reutilizado como fundo de Sessões, retratos de NPCs, atlas de Locais e fotografia de Arquivos. Em sequência, isso reduz a sensação de que cada capítulo possui identidade própria.

Decisão:
- manter a arte no Hero e na Crônica;
- manter uma reutilização pequena como fotografia de evidência em Arquivos;
- transformar Sessões em superfície de arquivo/dossiê sem fotografia de fundo;
- transformar NPCs em retratos abstratos/silhuetas documentais próprios;
- transformar Locais em cartografia gráfica, sem fotografia de cidade como base.

### 4. Mobile possui alguns blocos mais altos do que o necessário — corrigir

Os tratamentos responsivos já existem e são seguros, porém a soma de áreas de 410–700 px em sequência torna a rolagem longa em telefone.

Decisão:
- preservar legibilidade e área de toque;
- reduzir apenas alturas decorativas;
- não comprimir texto, CTA ou metadados;
- manter layout de uma coluna onde já existe.

### 5. Movimento deve ser progressivo, não obrigatório

A Home precisa continuar íntegra quando animações estiverem indisponíveis.

Decisão:
- `IntersectionObserver` para entrada por scroll;
- fallback imediato para conteúdo visível quando a API não existir;
- parallax restrito ao Hero e à grande imagem da Crônica;
- `requestAnimationFrame` + listener passivo para evitar trabalho excessivo durante scroll;
- `prefers-reduced-motion: reduce` desativa transições e parallax;
- nenhum movimento na ficha digital.

## Padrão de movimento aprovado

- entrada de cenas: `opacity + translateY` curto;
- stagger discreto entre texto e painel visual;
- parallax máximo visualmente pequeno (aprox. ±14 px);
- hover apenas em dispositivos que realmente possuem hover;
- foco por teclado sempre visível;
- sem loop constante de animação decorativa;
- sem bibliotecas de animação e sem framework novo.

## Critério de homologação da Fase 3

1. Home monta Hero + seis cenas em ordem.
2. Seção editorial antiga desaparece somente após montagem completa.
3. Todas as rotas/CTAs permanecem iguais.
4. Ficha `#view-sheet` continua fora do escopo.
5. `prefers-reduced-motion` possui fallback explícito.
6. Movimento usa `IntersectionObserver`, `requestAnimationFrame` e scroll passivo.
7. Regressões v1.1/v1.2 e Fases 1–2F continuam verdes.
8. Nenhuma alteração em `main` ou produção antes de gate de release.
