/**
 * CHRONUS — Documents Module (Arquivos & Evidências)
 * Renderização e controle de listagem de documentos e evidências da crônica com suporte a preview assinada e abertura controlada de arquivos.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getDocuments().
 * 2. Resolve preview (image_path) via window.ChronusAssets.getSignedUrl('documents', ..., { expiresIn: 3600 }).
 * 3. Resolve arquivo (file_path) via window.ChronusAssets.getSignedUrl('documents', ..., { expiresIn: 300 }) SOMENTE sob clique explícito.
 * 4. file_path nunca é assinado na renderização inicial nem exposto no DOM/HTML.
 * 5. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 6. Protegido contra race conditions via requestId incremental e validação de rota ativa.
 */
window.ChronusDocuments = (function() {
  'use strict';

  let currentRequestId = 0;

  const TYPE_MAP = {
    'letter': 'Carta',
    'report': 'Relatório',
    'photo': 'Fotografia',
    'newspaper': 'Jornal',
    'diary': 'Diário',
    'file': 'Arquivo',
    'record': 'Registro',
    'map': 'Mapa',
    'note': 'Nota',
    'audio': 'Áudio',
    'video': 'Vídeo',
    'artifact': 'Artefato',
    'evidence': 'Evidência',
    'other': 'Outro'
  };

  /**
   * Valida se a requisição assíncrona ainda é a mais recente e se a rota ativa continua sendo Arquivos & Evidências.
   * @private
   * @param {number} requestId
   * @returns {boolean}
   */
  function isRequestCurrent(requestId) {
    return (
      requestId === currentRequestId &&
      window.ChronusRouter?.getCurrentRoute?.() === '#/files'
    );
  }

  function init() {
    window.ChronusAuth?.onAuthChange(() => {
      if (window.ChronusRouter?.getCurrentRoute() === '#/files') {
        load();
      }
    });
  }

  async function load() {
    const container = document.getElementById('documents-list-container');
    if (!container) return;

    const requestId = ++currentRequestId;

    // Estado A: LOADING
    renderLoading(container);

    try {
      const documents = await window.ChronusContent.getDocuments();

      if (!isRequestCurrent(requestId)) return;

      if (!documents || documents.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Documentos com Resolução Segura de Previews
        await renderDocuments(container, documents, requestId);
      }
    } catch (err) {
      if (!isRequestCurrent(requestId)) return;
      console.error('CHRONUS [DocumentsModule]: Falha ao carregar documentos:', err);
      // Estado C: ERROR
      renderError(container);
    }
  }

  function renderLoading(container) {
    container.innerHTML = '';
    const loadingBox = document.createElement('div');
    loadingBox.className = 'dashboard-loading';

    const spinner = document.createElement('div');
    spinner.className = 'spinner-occult';

    const text = document.createElement('p');
    text.textContent = 'Carregando arquivos da campanha...';

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(text);
    container.appendChild(loadingBox);
  }

  function renderEmpty(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-empty-state';

    const title = document.createElement('h3');
    title.textContent = 'Nenhum arquivo disponível';

    const desc = document.createElement('p');
    desc.textContent = 'Documentos, evidências e registros descobertos durante a crônica aparecerão aqui.';

    box.appendChild(title);
    box.appendChild(desc);
    container.appendChild(box);
  }

  function renderError(container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'editorial-box content-error-state';

    const title = document.createElement('h3');
    title.textContent = 'Não foi possível carregar os arquivos';

    const desc = document.createElement('p');
    desc.textContent = 'Ocorreu uma instabilidade ao consultar os documentos da campanha.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-btn portal-btn-secondary';
    btn.textContent = 'Tentar novamente';
    btn.addEventListener('click', () => load());

    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(btn);
    container.appendChild(box);
  }

  function formatType(typeVal) {
    if (!typeVal) return '';
    return TYPE_MAP[typeVal] || typeVal;
  }

  async function renderDocuments(container, documents, requestId) {
    // 1. Resolver Signed URLs EXCLUSIVAMENTE para previews (image_path)
    const docsWithAssets = await Promise.all(documents.map(async (doc) => {
      let signedImageUrl = null;
      if (doc.image_path && typeof doc.image_path === 'string' && doc.image_path.trim()) {
        try {
          signedImageUrl = await window.ChronusAssets?.getSignedUrl?.('documents', doc.image_path, { expiresIn: 3600 });
        } catch (err) {
          console.error('CHRONUS [DocumentsModule]: Falha ao resolver preview do documento');
          signedImageUrl = null;
        }
      }

      if (!isRequestCurrent(requestId)) {
        return { doc, signedImageUrl: null, stale: true };
      }

      return { doc, signedImageUrl, stale: false };
    }));

    // Guarda contra race condition pós-assinatura assíncrona de previews
    if (!isRequestCurrent(requestId)) return;

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    docsWithAssets.forEach(({ doc, signedImageUrl, stale }) => {
      if (stale) return;

      const card = document.createElement('article');
      card.className = 'editorial-card content-card document-card';

      // 1. Preview Visual do Documento (se houver signedImageUrl válida)
      if (signedImageUrl && typeof signedImageUrl === 'string') {
        const previewWrap = document.createElement('div');
        previewWrap.className = 'document-preview-wrap';

        const img = document.createElement('img');
        img.className = 'document-preview-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = doc.title ? `Prévia de ${doc.title}` : 'Prévia do documento';
        img.src = signedImageUrl;

        previewWrap.appendChild(img);
        card.appendChild(previewWrap);
      }

      // 2. Cabeçalho Textual e Metadados
      const headerDiv = document.createElement('div');

      // Top row: Tipo do Documento
      const topRow = document.createElement('div');
      topRow.className = 'content-card-top-row';

      if (doc.type) {
        const kicker = document.createElement('span');
        kicker.className = 'section-kicker';
        kicker.textContent = formatType(doc.type);
        topRow.appendChild(kicker);
      }

      if (topRow.childElementCount > 0) {
        headerDiv.appendChild(topRow);
      }

      // Título do Documento
      const title = document.createElement('h3');
      title.className = 'card-title-editorial';
      title.textContent = doc.title || 'Arquivo sem título';
      headerDiv.appendChild(title);

      // Data Narrativa
      if (doc.narrative_date) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'document-date';
        const iconSpan = document.createElement('span');
        iconSpan.textContent = '📅 ';
        const textSpan = document.createTextNode(doc.narrative_date);
        dateDiv.appendChild(iconSpan);
        dateDiv.appendChild(textSpan);
        headerDiv.appendChild(dateDiv);
      }

      // Descrição Pública
      if (doc.public_description) {
        const desc = document.createElement('p');
        desc.className = 'card-text-body document-public-desc';
        desc.textContent = doc.public_description;
        headerDiv.appendChild(desc);
      }

      card.appendChild(headerDiv);

      // 3. Ação de Abertura de Arquivo (se file_path existir)
      if (doc.file_path && typeof doc.file_path === 'string' && doc.file_path.trim()) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'document-card-actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'portal-btn portal-btn-secondary document-open-button';
        openBtn.textContent = 'Abrir documento';

        const msgDiv = document.createElement('div');
        msgDiv.className = 'document-action-msg';
        msgDiv.setAttribute('role', 'status');
        msgDiv.setAttribute('aria-live', 'polite');

        openBtn.addEventListener('click', async () => {
          msgDiv.textContent = '';
          if (!isRequestCurrent(requestId)) return;

          // Abrir popup síncrono no evento de clique para contornar bloqueadores
          let popup = null;
          try {
            popup = window.open('about:blank', '_blank');
            if (popup) {
              popup.opener = null;
            }
          } catch (e) {
            popup = null;
          }

          if (!popup) {
            msgDiv.textContent = 'Não foi possível abrir uma nova aba. Verifique o bloqueio de pop-ups.';
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
            signedFileUrl = null;
          }

          // 1. Guarda de requisição stale / troca de rota
          if (!isRequestCurrent(requestId)) {
            if (popup && !popup.closed) {
              try { popup.close(); } catch (e) {}
            }
            return;
          }

          // 2. Popup fechado manualmente antes da resolução (em rota ativa)
          if (!popup || popup.closed) {
            openBtn.disabled = false;
            openBtn.textContent = originalText;
            msgDiv.textContent = 'A nova aba foi fechada antes de o documento ser aberto.';
            return;
          }

          if (signedFileUrl && typeof signedFileUrl === 'string') {
            let navigationSucceeded = false;
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

            if (navigationSucceeded) {
              openBtn.disabled = false;
              openBtn.textContent = originalText;
            } else {
              if (popup && !popup.closed) {
                try { popup.close(); } catch (e) {}
              }
              openBtn.disabled = false;
              openBtn.textContent = originalText;
              msgDiv.textContent = 'Não foi possível abrir este documento.';
            }
          } else {
            if (popup && !popup.closed) {
              try { popup.close(); } catch (e) {}
            }
            openBtn.disabled = false;
            openBtn.textContent = originalText;
            msgDiv.textContent = 'Não foi possível abrir este documento.';
          }
        });

        actionsDiv.appendChild(openBtn);
        actionsDiv.appendChild(msgDiv);
        card.appendChild(actionsDiv);
      }

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  return {
    init,
    load
  };
})();
