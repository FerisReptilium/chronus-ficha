/**
 * CHRONUS v1.1 — Library CREATE UI Extension
 * Liga o fluxo composto createLibraryItemWithFile() ao CMS do Narrador.
 * A UI nunca acessa Supabase/Storage diretamente: toda mutação passa por
 * window.ChronusEditorial.
 */
(function installChronusLibraryV11() {
  'use strict';

  const CREATE_BUTTON_ID = 'btn-v11-library-create';
  const MODAL_ID = 'v11-library-create-modal';
  let observer = null;
  let dirty = false;
  let submitting = false;

  function isNarratorLibraryView() {
    if (!window.location.hash.startsWith('#/narrator')) return false;
    if (window.ChronusAuth?.getProfile?.()?.role !== 'narrator') return false;
    const activeTab = document.querySelector('#narrator-pane-editorial .editorial-nav-btn.is-active');
    return Boolean(activeTab && /biblioteca/i.test(activeTab.textContent || ''));
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-');
  }

  function ensureStyles() {
    if (document.getElementById('chronus-v11-library-style')) return;
    const style = document.createElement('style');
    style.id = 'chronus-v11-library-style';
    style.textContent = `
      .v11-modal-backdrop {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(5, 4, 3, .82);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      .v11-modal-card {
        width: min(760px, 100%); max-height: 90vh; overflow: auto;
        background: var(--bg-card, #17120f);
        border: 1px solid var(--border-gold, #6d491d);
        border-radius: 10px; padding: 22px;
        box-shadow: 0 18px 70px rgba(0,0,0,.55);
      }
      .v11-modal-head { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; margin-bottom:18px; }
      .v11-modal-title { margin:0; color:var(--gold-highlight, #d8b46a); font-family:var(--font-title, serif); }
      .v11-modal-sub { margin:6px 0 0; color:var(--ink-muted, #b7aa98); }
      .v11-modal-close { background:transparent; border:0; color:#d7c8b8; font-size:1.2rem; cursor:pointer; }
      .v11-library-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
      .v11-library-field { display:flex; flex-direction:column; gap:6px; }
      .v11-library-field.full { grid-column:1 / -1; }
      .v11-library-field label { font-weight:600; color:#d8c9b8; }
      .v11-library-field input,
      .v11-library-field select,
      .v11-library-field textarea {
        width:100%; box-sizing:border-box; padding:10px 11px;
        border:1px solid rgba(201,154,69,.36); border-radius:6px;
        background:rgba(0,0,0,.24); color:#f1e7d8;
      }
      .v11-library-help { font-size:.78rem; color:var(--ink-muted, #a99c8b); }
      .v11-library-error { margin:14px 0; padding:10px 12px; border:1px solid rgba(200,65,65,.55); border-radius:6px; color:#ffd0ca; background:rgba(110,25,25,.18); }
      .v11-library-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; flex-wrap:wrap; }
      @media (max-width: 680px) {
        .v11-library-grid { grid-template-columns:1fr; }
        .v11-library-field.full { grid-column:auto; }
        .v11-modal-card { padding:16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function closeModal(force = false) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return true;
    if (!force && dirty && !submitting) {
      const discard = window.confirm('Existem dados não enviados. Deseja fechar e descartar o formulário?');
      if (!discard) return false;
    }
    modal.remove();
    dirty = false;
    submitting = false;
    return true;
  }

  function makeField(labelText, input, full = false, helpText = null) {
    const group = document.createElement('div');
    group.className = `v11-library-field${full ? ' full' : ''}`;
    const label = document.createElement('label');
    label.textContent = labelText;
    if (input.id) label.setAttribute('for', input.id);
    group.appendChild(label);
    group.appendChild(input);
    if (helpText) {
      const help = document.createElement('span');
      help.className = 'v11-library-help';
      help.textContent = helpText;
      group.appendChild(help);
    }
    return group;
  }

  function createInput(id, type = 'text') {
    const el = document.createElement('input');
    el.id = id;
    el.type = type;
    return el;
  }

  function openCreateModal() {
    if (document.getElementById(MODAL_ID)) return;
    if (!window.ChronusEditorial || typeof window.ChronusEditorial.createLibraryItemWithFile !== 'function') {
      window.alert('O fluxo seguro de criação da Biblioteca não está disponível. Atualize a página e tente novamente.');
      return;
    }

    ensureStyles();
    dirty = false;
    submitting = false;

    const backdrop = document.createElement('div');
    backdrop.id = MODAL_ID;
    backdrop.className = 'v11-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'v11-library-title');

    const card = document.createElement('div');
    card.className = 'v11-modal-card';

    const head = document.createElement('div');
    head.className = 'v11-modal-head';
    const headText = document.createElement('div');
    const title = document.createElement('h3');
    title.id = 'v11-library-title';
    title.className = 'v11-modal-title';
    title.textContent = '📚 Novo Item da Biblioteca';
    const sub = document.createElement('p');
    sub.className = 'v11-modal-sub';
    sub.textContent = 'O item será criado como rascunho, visível somente ao Narrador, com o PDF real já armazenado.';
    headText.appendChild(title);
    headText.appendChild(sub);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'v11-modal-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => closeModal(false));
    head.appendChild(headText);
    head.appendChild(closeBtn);
    card.appendChild(head);

    const form = document.createElement('form');
    form.noValidate = true;
    const grid = document.createElement('div');
    grid.className = 'v11-library-grid';

    const titleInput = createInput('v11-lib-title');
    titleInput.required = true;
    titleInput.placeholder = 'Ex: Manual Oficial CHRONUS';

    const slugInput = createInput('v11-lib-slug');
    slugInput.required = true;
    slugInput.placeholder = 'manual-oficial-chronus';
    let slugTouched = false;

    const category = document.createElement('select');
    category.id = 'v11-lib-category';
    [
      ['system_book', 'Livro do Sistema'],
      ['pocket_manual', 'Manual de Bolso'],
      ['quick_guide', 'Guia Rápido'],
      ['character_sheet', 'Ficha de Personagem'],
      ['supplement', 'Suplemento'],
      ['extra', 'Material Extra']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      category.appendChild(option);
    });

    const version = createInput('v11-lib-version');
    version.value = '1.0';

    const pageCount = createInput('v11-lib-pages', 'number');
    pageCount.min = '1';
    pageCount.step = '1';

    const sortOrder = createInput('v11-lib-sort', 'number');
    sortOrder.step = '1';
    sortOrder.value = '0';

    const description = document.createElement('textarea');
    description.id = 'v11-lib-description';
    description.rows = 4;
    description.placeholder = 'Descrição da edição, conteúdo e uso em jogo…';

    const pdfInput = createInput('v11-lib-pdf', 'file');
    pdfInput.required = true;
    pdfInput.accept = 'application/pdf';

    grid.appendChild(makeField('Título *', titleInput));
    grid.appendChild(makeField('Slug *', slugInput));
    grid.appendChild(makeField('Categoria *', category));
    grid.appendChild(makeField('Versão', version));
    grid.appendChild(makeField('Número de páginas', pageCount));
    grid.appendChild(makeField('Ordem de exibição', sortOrder));
    grid.appendChild(makeField('Descrição', description, true));
    grid.appendChild(makeField('Arquivo PDF *', pdfInput, true, 'Somente PDF, até 50MB. O arquivo não será publicado automaticamente.'));
    form.appendChild(grid);

    const errorBox = document.createElement('div');
    errorBox.className = 'v11-library-error';
    errorBox.hidden = true;
    errorBox.setAttribute('aria-live', 'polite');
    form.appendChild(errorBox);

    const actions = document.createElement('div');
    actions.className = 'v11-library-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'portal-btn portal-btn-secondary';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => closeModal(false));
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'portal-btn portal-btn-gold';
    submit.textContent = '📤 Criar item com PDF';
    actions.appendChild(cancel);
    actions.appendChild(submit);
    form.appendChild(actions);

    const markDirty = () => { dirty = true; };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    titleInput.addEventListener('input', () => {
      if (!slugTouched) slugInput.value = slugify(titleInput.value);
    });
    slugInput.addEventListener('input', () => { slugTouched = true; });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitting) return;
      errorBox.hidden = true;
      errorBox.textContent = '';

      const file = pdfInput.files?.[0] || null;
      const metadata = {
        title: titleInput.value.trim(),
        slug: slugInput.value.trim(),
        category: category.value,
        version: version.value.trim() || '1.0',
        description: description.value.trim() || null,
        page_count: pageCount.value ? Number(pageCount.value) : null,
        sort_order: sortOrder.value ? Number(sortOrder.value) : 0
      };

      if (!metadata.title || !metadata.slug || !file) {
        errorBox.textContent = 'Preencha título, slug e selecione o PDF obrigatório.';
        errorBox.hidden = false;
        return;
      }
      if (file.type !== 'application/pdf') {
        errorBox.textContent = 'O arquivo selecionado precisa ser um PDF.';
        errorBox.hidden = false;
        return;
      }

      submitting = true;
      submit.disabled = true;
      cancel.disabled = true;
      closeBtn.disabled = true;
      submit.textContent = 'Enviando e criando…';

      try {
        const result = await window.ChronusEditorial.createLibraryItemWithFile(metadata, file);
        if (!result?.ok) {
          const suffix = result?.code === 'COMPENSATION_FAILED'
            ? ' Há uma limpeza técnica pendente registrada pelo sistema.'
            : '';
          errorBox.textContent = (result?.message || 'Não foi possível criar o item da Biblioteca.') + suffix;
          errorBox.hidden = false;
          return;
        }

        dirty = false;
        closeModal(true);
        window.alert('Item da Biblioteca criado com sucesso como rascunho exclusivo do Narrador.');
        await window.ChronusNarratorPanel?.load?.();
      } catch (error) {
        console.error('CHRONUS v1.1: falha inesperada ao criar item da Biblioteca:', error);
        errorBox.textContent = 'Ocorreu uma falha inesperada durante a criação do item.';
        errorBox.hidden = false;
      } finally {
        submitting = false;
        if (document.body.contains(submit)) {
          submit.disabled = false;
          cancel.disabled = false;
          closeBtn.disabled = false;
          submit.textContent = '📤 Criar item com PDF';
        }
      }
    });

    card.appendChild(form);
    backdrop.appendChild(card);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeModal(false);
    });

    document.body.appendChild(backdrop);
    setTimeout(() => titleInput.focus(), 20);
  }

  function enhanceLibraryToolbar() {
    if (!isNarratorLibraryView()) return;
    const toolbar = document.querySelector('#editorial-content-container .editorial-toolbar');
    if (!toolbar || document.getElementById(CREATE_BUTTON_ID)) return;

    const button = document.createElement('button');
    button.id = CREATE_BUTTON_ID;
    button.type = 'button';
    button.className = 'portal-btn portal-btn-gold btn-new-editorial';
    button.textContent = '+ Novo Item com PDF';
    button.setAttribute('aria-label', 'Criar novo item da Biblioteca com arquivo PDF');
    button.addEventListener('click', openCreateModal);
    toolbar.prepend(button);
  }

  function observeNarratorPanel() {
    const root = document.getElementById('narrator-panel-container');
    if (!root || observer) return;
    observer = new MutationObserver(() => queueMicrotask(enhanceLibraryToolbar));
    observer.observe(root, { childList: true, subtree: true });
    enhanceLibraryToolbar();
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById(MODAL_ID)) {
      closeModal(false);
    }
  });

  ensureStyles();
  observeNarratorPanel();
})();
