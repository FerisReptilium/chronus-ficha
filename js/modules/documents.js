/**
 * CHRONUS — Documents Module (Arquivos & Evidências)
 * Renderização e controle de listagem de documentos e evidências da crônica.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Consome exclusivamente window.ChronusContent.getDocuments().
 * 2. Manipula o DOM de forma segura com document.createElement e textContent (sem XSS).
 * 3. Protegido contra race conditions via requestId incremental.
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

      if (requestId !== currentRequestId) return;

      if (!documents || documents.length === 0) {
        // Estado B: EMPTY
        renderEmpty(container);
      } else {
        // Renderizar Lista de Documentos
        renderDocuments(container, documents);
      }
    } catch (err) {
      if (requestId !== currentRequestId) return;
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

  function renderDocuments(container, documents) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'editorial-cards-grid content-list-grid';

    documents.forEach(doc => {
      const card = document.createElement('article');
      card.className = 'editorial-card content-card document-card';

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
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  return {
    init,
    load
  };
})();
