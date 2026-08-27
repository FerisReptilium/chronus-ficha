/**
 * CHRONUS — Documents Module (Arquivos & Evidências)
 * Renderização cinematográfica da rota #/files com previews assinadas e
 * abertura controlada de arquivos privados.
 *
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome documentos exclusivamente via window.ChronusContent.getDocuments().
 * 2. Consulta sessões apenas via window.ChronusContent.getSessions() para resolver,
 *    pelo nome, a sessão de descoberta que o RLS já permitiu ao perfil atual.
 * 3. Resolve preview (image_path) via signed URL de 1h no bucket 'documents'.
 * 4. Resolve file_path via signed URL de 5min SOMENTE após clique explícito.
 * 5. file_path nunca é assinado na renderização inicial nem exposto no DOM/HTML.
 * 6. Todo conteúdo textual do Supabase usa textContent/createTextNode, nunca HTML cru.
 * 7. Protegido contra race conditions via requestId e validação da rota ativa.
 */
window.ChronusDocuments = (function() {
  'use strict';

  const STYLESHEET = 'css/cinematic-files-page-v13.css';
  let currentRequestId = 0;

  const TYPE_MAP = {
    'photograph': 'Fotografia',
    'letter': 'Carta',
    'report': 'Relatório',
    'newspaper_clipping': 'Recorte de Jornal',
    'official_record': 'Registro Oficial',
    'clue': 'Pista',
    'artifact': 'Artefato',
    'audio_log': 'Registro de Áudio',
    'other': 'Outro'
  };

  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/files'
    );
  }

  function init() {
    setupStyles();
    setupPageChrome();

    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/files') load();
    });
  }

  function setupStyles() {
    if (document.querySelector('link[data-chronus-v13-files-page="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET;
    link.dataset.chronusV13FilesPage = 'true';
    document.head.appendChild(link);
  }

  function setupPageChrome() {
    const view = document.getElementById('view-files');
    const head = view?.querySelector('.section-head-editorial');
    if (!view || !head) return;

    view.classList.add('files-internal-v13');

    if (!head.querySelector('.files-page-context-v13')) {
      const context = document.createElement('div');
      context.className = 'files-page-context-v13';
      context.textContent = 'Berlim · Arquivo investigativo · evidências autorizadas';
      head.prepend(context);
    }
  }

  async function load() {
    const container = document.getElementById('documents-list-container');
    if (!container) return;

    setupPageChrome();
    const requestId = ++currentRequestId;
    renderLoading(container);

    try {
      const [documents, visibleSessions] = await Promise.all([
        window.ChronusContent.getDocuments(),
        window.ChronusContent.getSessions().catch(() => {
          console.error('CHRONUS [DocumentsModule]: Não foi possível resolver referências de sessão');
          return [];
        })
      ]);

      if (!isRequestCurrent(requestId)) return;

      if (!documents || documents.length === 0) {
        renderEmpty(container);
      } else {
        await renderDocuments(container, documents, visibleSessions || [], requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [DocumentsModule]: Falha ao carregar documentos:', err);
      renderError(container);
    }
  }

  function createStateShell(mark, titleText, descText) {
    const box = document.createElement('div');
    box.className = 'files-page-state-v13';

    const inner = document.createElement('div');
    inner.className = 'files-page-state-inner-v13';

    const sigil = document.createElement('div');
    sigil.className = 'files-page-state-mark-v13';
    sigil.textContent = mark;

    const title = document.createElement('h3');
    title.textContent = titleText;

    const desc = document.createElement('p');
    desc.textContent = descText;

    inner.append(sigil, title, desc);
    box.appendChild(inner);
    return { box, inner };
  }

  function renderLoading(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('▣', 'Abrindo o arquivo investigativo', 'Recuperando documentos e evidências permitidos para o seu perfil...');
    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';
    inner.prepend(spinner);
    container.appendChild(box);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const { box } = createStateShell('◇', 'Nenhuma evidência disponível', 'Documentos, registros e pistas aparecerão aqui quando forem liberados para o seu perfil.');
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const { box, inner } = createStateShell('×', 'Não foi possível abrir os arquivos', 'Ocorreu uma instabilidade ao consultar as evidências da campanha. Tente novamente em instantes.');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());
    inner.appendChild(btn);
    container.appendChild(box);
  }

  function formatType(typeVal) {
    if (!typeVal) return 'Documento';
    return TYPE_MAP[typeVal] || typeVal;
  }

  async function resolvePreviewAssets(documents, requestId) {
    return Promise.all(documents.map(async (doc) => {
      let signedImageUrl = null;

      if (doc.image_path && typeof doc.image_path === 'string' && doc.image_path.trim()) {
        try {
          signedImageUrl = await window.ChronusAssets?.getSignedUrl?.('documents', doc.image_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [DocumentsModule]: Falha ao resolver preview do documento');
        }
      }

      return {
        doc,
        signedImageUrl,
        stale: !isRequestCurrent(requestId)
      };
    }));
  }

  async function renderDocuments(container, documents, visibleSessions, requestId) {
    const docsWithAssets = await resolvePreviewAssets(documents, requestId);
    if (!isRequestCurrent(requestId)) return;

    const validEntries = docsWithAssets.filter(entry => !entry.stale);
    const sessionById = new Map(visibleSessions.map(session => [session.id, session]));

    container.innerHTML = '';
    container.appendChild(buildSummary(validEntries.map(entry => entry.doc)));

    const archive = document.createElement('div');
    archive.className = 'files-page-archive-v13';

    validEntries.forEach((entry, index) => {
      archive.appendChild(buildDocumentEntry(entry, index, sessionById, requestId));
    });

    container.appendChild(archive);
  }

  function buildSummary(documents) {
    const summary = document.createElement('section');
    summary.className = 'files-page-summary-v13';
    summary.setAttribute('aria-label', 'Resumo dos arquivos disponíveis');

    const types = new Set(documents.map(doc => doc.type).filter(Boolean));
    const previews = documents.filter(doc => doc.image_path).length;
    const attachments = documents.filter(doc => doc.file_path).length;

    const items = [
      ['Evidências disponíveis', String(documents.length)],
      ['Tipos catalogados', String(types.size)],
      ['Previews visuais', `${previews} de ${documents.length}`],
      ['Arquivos associados', `${attachments} de ${documents.length}`]
    ];

    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'files-page-summary-item-v13';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(span, strong);
      summary.appendChild(item);
    });

    return summary;
  }

  function buildDocumentEntry(entry, index, sessionById, requestId) {
    const { doc, signedImageUrl } = entry;
    const article = document.createElement('article');
    article.className = 'files-page-entry-v13';
    if (index === 0) article.classList.add('is-featured');

    const preview = document.createElement('div');
    preview.className = 'files-page-preview-v13';

    if (signedImageUrl && typeof signedImageUrl === 'string') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = doc.title ? `Prévia de ${doc.title}` : 'Prévia do documento';
      img.src = signedImageUrl;
      preview.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'files-page-preview-fallback-v13';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = getTypeMark(doc.type);
      preview.appendChild(fallback);
    }

    const code = document.createElement('span');
    code.className = 'files-page-file-code-v13';
    code.textContent = doc.slug ? `EVIDÊNCIA · ${doc.slug}` : `EVIDÊNCIA · ${String(index + 1).padStart(3, '0')}`;
    preview.appendChild(code);

    const stamp = document.createElement('span');
    stamp.className = 'files-page-stamp-v13';
    stamp.textContent = 'Catalogado';
    preview.appendChild(stamp);

    const body = document.createElement('div');
    body.className = 'files-page-body-v13';

    const topline = document.createElement('div');
    topline.className = 'files-page-topline-v13';

    const type = document.createElement('span');
    type.className = 'files-page-type-v13';
    type.textContent = formatType(doc.type);
    topline.appendChild(type);

    if (doc.narrative_date) {
      const date = document.createElement('span');
      date.className = 'files-page-date-v13';
      date.textContent = doc.narrative_date;
      topline.appendChild(date);
    }

    const title = document.createElement('h3');
    title.className = 'files-page-title-v13';
    title.textContent = doc.title || 'Arquivo sem título';
    body.append(topline, title);

    if (doc.public_description) {
      const desc = document.createElement('p');
      desc.className = 'files-page-description-v13';
      desc.textContent = doc.public_description;
      body.appendChild(desc);
    }

    if (doc.found_in_session_id) {
      body.appendChild(buildSessionReference(doc.found_in_session_id, sessionById));
    }

    if (doc.transcription && typeof doc.transcription === 'string' && doc.transcription.trim()) {
      const details = document.createElement('details');
      details.className = 'files-page-transcription-v13';
      const summary = document.createElement('summary');
      summary.textContent = 'Ler transcrição';
      const text = document.createElement('div');
      text.className = 'files-page-transcription-text-v13';
      text.textContent = doc.transcription;
      details.append(summary, text);
      body.appendChild(details);
    }

    const meta = document.createElement('div');
    meta.className = 'files-page-meta-v13';
    meta.appendChild(buildMetaChip(doc.visibility ? `Visibilidade · ${doc.visibility}` : 'Visibilidade · padrão'));
    meta.appendChild(buildMetaChip(doc.published === false ? 'Não publicado' : 'Publicado', doc.published === false));
    meta.appendChild(buildMetaChip(signedImageUrl ? 'Preview · disponível' : 'Preview · não associado'));
    meta.appendChild(buildMetaChip(doc.file_path ? 'Arquivo · associado' : 'Arquivo · não associado'));
    body.appendChild(meta);

    if (doc.file_path && typeof doc.file_path === 'string' && doc.file_path.trim()) {
      body.appendChild(buildOpenFileAction(doc, requestId));
    }

    article.append(preview, body);
    return article;
  }

  function buildSessionReference(sessionId, sessionById) {
    const box = document.createElement('div');
    box.className = 'files-page-session-v13';

    const label = document.createElement('span');
    label.textContent = 'Encontrado em';

    const value = document.createElement('strong');
    const session = sessionById.get(sessionId);
    if (session) {
      const number = session.session_number != null ? `Sessão ${session.session_number}` : 'Sessão';
      value.textContent = session.title ? `${number} · ${session.title}` : number;
    } else {
      value.textContent = 'Sessão de descoberta não disponível neste acesso';
    }

    box.append(label, value);
    return box;
  }

  function buildOpenFileAction(doc, requestId) {
    const actions = document.createElement('div');
    actions.className = 'files-page-actions-v13';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'portal-btn portal-btn-secondary files-page-open-button-v13';
    openBtn.textContent = 'Abrir documento';

    const msg = document.createElement('div');
    msg.className = 'files-page-action-msg-v13';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');

    openBtn.addEventListener('click', async () => {
      msg.textContent = '';
      if (!isRequestCurrent(requestId)) return;

      let popup = null;
      try {
        popup = window.open('about:blank', '_blank');
        if (popup) popup.opener = null;
      } catch (e) {
        popup = null;
      }

      if (!popup) {
        msg.textContent = 'Não foi possível abrir uma nova aba. Verifique o bloqueio de pop-ups.';
        return;
      }

      openBtn.disabled = true;
      const originalText = openBtn.textContent;
      openBtn.textContent = 'Abrindo...';

      let signedFileUrl = null;
      try {
        signedFileUrl = await window.ChronusAssets?.getSignedUrl?.('documents', doc.file_path, { expiresIn: 300 });
      } catch (err) {
        console.error('CHRONUS [DocumentsModule]: Falha ao assinar arquivo do documento');
      }

      if (!isRequestCurrent(requestId)) {
        if (popup && !popup.closed) {
          try { popup.close(); } catch (e) {}
        }
        return;
      }

      if (!popup || popup.closed) {
        openBtn.disabled = false;
        openBtn.textContent = originalText;
        msg.textContent = 'A nova aba foi fechada antes de o documento ser aberto.';
        return;
      }

      let navigationSucceeded = false;
      if (signedFileUrl && typeof signedFileUrl === 'string') {
        try {
          popup.location.replace(signedFileUrl);
          navigationSucceeded = true;
        } catch (e) {
          try {
            popup.location.href = signedFileUrl;
            navigationSucceeded = true;
          } catch (err2) {
            navigationSucceeded = false;
          }
        }
      }

      if (!navigationSucceeded && popup && !popup.closed) {
        try { popup.close(); } catch (e) {}
      }

      openBtn.disabled = false;
      openBtn.textContent = originalText;
      if (!navigationSucceeded) msg.textContent = 'Não foi possível abrir este documento.';
    });

    actions.append(openBtn, msg);
    return actions;
  }

  function buildMetaChip(text, isDraft = false) {
    const chip = document.createElement('span');
    chip.className = 'files-page-meta-chip-v13';
    if (isDraft) chip.classList.add('is-draft');
    chip.textContent = text;
    return chip;
  }

  function getTypeMark(type) {
    const marks = {
      photograph: '◉',
      letter: '✉',
      report: '▤',
      newspaper_clipping: '▥',
      official_record: '▣',
      clue: '⌕',
      artifact: '◇',
      audio_log: '◌'
    };
    return marks[type] || '▧';
  }

  return {
    init,
    load
  };
})();
