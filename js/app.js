/**
 * CHRONUS — Application Main Bootstrap
 * Inicialização dos serviços, roteador, listeners globais e modais.
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('CHRONUS: Inicializando portal...');

  // 1. Inicializar Supabase & Auth
  window.ChronusSupabase.init();
  await window.ChronusAuth.init();

  // 2. Inicializar Roteador Hash
  window.ChronusRouter.init();

  // 3. Inicializar Módulos de Página
  window.ChronusHome.init();
  window.ChronusChronicle?.init?.();
  window.ChronusSessions?.init?.();
  window.ChronusNpcs?.init?.();
  window.ChronusLocations?.init?.();
  window.ChronusDocuments?.init?.();
  window.ChronusSoundtrack?.init?.();
  window.ChronusLibrary?.init?.();

  // 4. Configurar Formulários de Autenticação
  setupAuthForms();

  console.log('CHRONUS: Portal pronto.');
});

function setupAuthForms() {
  const loginForm = document.getElementById('authForm');
  const loginEmail = document.getElementById('authEmail');
  const loginPassword = document.getElementById('authPassword');
  const forgotBtn = document.getElementById('authForgotButton');
  const btnCloseAuth = document.getElementById('btn-close-auth-modal');

  const passwordForm = document.getElementById('passwordForm');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const btnClosePassword = document.getElementById('passwordCancelButton');

  // Fechar Modais
  btnCloseAuth?.addEventListener('click', () => window.ChronusAuth.hideAuthModal());
  btnClosePassword?.addEventListener('click', () => window.ChronusAuth.hidePasswordModal());

  // Fechar ao clicar no backdrop escuro
  document.getElementById('authGate')?.addEventListener('click', (e) => {
    if (e.target.id === 'authGate') window.ChronusAuth.hideAuthModal();
  });
  document.getElementById('passwordGate')?.addEventListener('click', (e) => {
    if (e.target.id === 'passwordGate') window.ChronusAuth.hidePasswordModal();
  });

  // Login Submit
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginEmail?.value.trim();
    const pass = loginPassword?.value;
    const msg = document.getElementById('authMessage');
    const loginBtn = document.getElementById('authLoginButton');

    if (!email || !pass) {
      if (msg) { msg.textContent = 'Informe e-mail e senha.'; msg.classList.add('is-error'); }
      return;
    }

    if (msg) { msg.textContent = 'Autenticando…'; msg.classList.remove('is-error'); }
    if (loginBtn) loginBtn.disabled = true;

    try {
      const res = await window.ChronusAuth.handleLogin(email, pass);
      if (res.profile?.role === 'narrator') {
        window.ChronusRouter.navigateTo('#/narrator');
      } else {
        window.ChronusRouter.navigateTo('#/player');
      }
    } catch (err) {
      if (msg) { msg.textContent = 'Falha no acesso: ' + (err.message || err); msg.classList.add('is-error'); }
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  });

  // Recuperação de Senha
  forgotBtn?.addEventListener('click', async () => {
    const email = loginEmail?.value.trim();
    const msg = document.getElementById('authMessage');

    if (!email) {
      if (msg) { msg.textContent = 'Digite seu e-mail acima para receber o link de recuperação.'; msg.classList.add('is-error'); }
      loginEmail?.focus();
      return;
    }

    if (msg) { msg.textContent = 'Enviando link de recuperação…'; msg.classList.remove('is-error'); }

    try {
      await window.ChronusAuth.handleResetPassword(email);
      if (msg) msg.textContent = 'Link enviado! Verifique seu e-mail e siga as instruções para criar uma nova senha.';
    } catch (err) {
      if (msg) { msg.textContent = 'Erro ao enviar link: ' + (err.message || err); msg.classList.add('is-error'); }
    }
  });

  // Alteração de Senha Submit
  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = newPassword?.value || '';
    const p2 = confirmPassword?.value || '';
    const msg = document.getElementById('passwordMessage');

    if (p1.length < 8) {
      if (msg) { msg.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; msg.classList.add('is-error'); }
      return;
    }

    if (p1 !== p2) {
      if (msg) { msg.textContent = 'As senhas digitadas não são idênticas.'; msg.classList.add('is-error'); }
      return;
    }

    if (msg) { msg.textContent = 'Salvando nova senha…'; msg.classList.remove('is-error'); }

    try {
      await window.ChronusAuth.handleUpdatePassword(p1);
      if (msg) msg.textContent = 'Senha atualizada com sucesso ✓';
      setTimeout(() => window.ChronusAuth.hidePasswordModal(), 1200);
    } catch (err) {
      if (msg) { msg.textContent = 'Erro ao atualizar senha: ' + (err.message || err); msg.classList.add('is-error'); }
    }
  });
}
