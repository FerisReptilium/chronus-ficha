/**
 * CHRONUS — Authentication & User Profile Service
 * Gerencia sessão, papéis (player/narrator), login, logout e recuperação de senha.
 */
window.ChronusAuth = (function() {
  let currentUser = null;
  let currentProfile = null;
  let passwordRecoveryAuthorized = false;
  const authListeners = [];

  function onAuthChange(cb) {
    if (typeof cb === 'function') authListeners.push(cb);
  }

  function notifyAuthListeners(user, profile) {
    authListeners.forEach(cb => {
      try { cb(user, profile); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  function getPasswordRecoveryCallback() {
    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.startsWith('#') ? location.hash.substring(1) : location.hash);
    const error = params.get('error') || hashParams.get('error');
    const errorCode = params.get('error_code') || hashParams.get('error_code');
    const errorDescription = params.get('error_description') || hashParams.get('error_description');
    const type = params.get('type') || hashParams.get('type');
    const requested = params.get('passwordReset') === '1' || type === 'recovery' || Boolean(error);
    return { requested, error, errorCode, errorDescription };
  }

  function clearPasswordRecoveryUrl() {
    const url = new URL(location.href);
    url.searchParams.delete('passwordReset');
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    url.searchParams.delete('type');
    history.replaceState(null, '', url.pathname + url.hash);
  }

  function passwordRedirectUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('passwordReset', '1');
    url.hash = '#/login';
    return url.toString();
  }

  async function fetchProfile(user) {
    if (!user) return null;
    const client = window.ChronusSupabase.getClient();
    if (!client) return null;
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('id', user.id)
        .single();
      if (error) {
        console.warn('CHRONUS: Perfil não encontrado ou sem permissão:', error);
        return { id: user.id, email: user.email, display_name: user.email?.split('@')[0] || 'Jogador', role: 'player' };
      }
      return data;
    } catch (err) {
      console.error('CHRONUS: Falha na requisição de perfil:', err);
      return null;
    }
  }

  async function init() {
    const client = window.ChronusSupabase.getClient();
    if (!client) {
      updateNavAuthUi(null, null);
      return;
    }

    const recoveryCallback = getPasswordRecoveryCallback();

    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryAuthorized = true;
        currentUser = session?.user || currentUser;
        showPasswordModal('recovery');
      }
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentProfile = null;
        updateNavAuthUi(null, null);
        notifyAuthListeners(null, null);
      }
      if (event === 'SIGNED_IN' && session?.user) {
        currentUser = session.user;
        currentProfile = await fetchProfile(session.user);
        updateNavAuthUi(currentUser, currentProfile);
        notifyAuthListeners(currentUser, currentProfile);
      }
    });

    if (recoveryCallback.requested && recoveryCallback.error) {
      passwordRecoveryAuthorized = false;
      const expired = recoveryCallback.errorCode === 'otp_expired' || /expired/i.test(recoveryCallback.errorDescription || '');
      const reason = expired
        ? 'O link de recuperação expirou ou já foi utilizado. Solicite um novo link em “Esqueci minha senha”.'
        : 'Não foi possível validar o link de recuperação. Solicite um novo link.';
      await client.auth.signOut().catch(() => {});
      clearPasswordRecoveryUrl();
      showAuthModal(reason, true);
      return;
    }

    try {
      const { data: { session }, error } = await client.auth.getSession();
      if (session?.user) {
        currentUser = session.user;
        currentProfile = await fetchProfile(session.user);
        updateNavAuthUi(currentUser, currentProfile);
        notifyAuthListeners(currentUser, currentProfile);
      } else {
        updateNavAuthUi(null, null);
        notifyAuthListeners(null, null);
      }
    } catch (e) {
      console.warn('CHRONUS: Erro ao checar sessão inicial:', e);
      updateNavAuthUi(null, null);
    }
  }

  function updateNavAuthUi(user, profile) {
    const userArea = document.getElementById('nav-user-area');
    const mobileUserArea = document.getElementById('mobile-nav-user-area');

    function buildHtml(isMobile = false) {
      if (!user) {
        return `
          <button type="button" class="portal-btn portal-btn-gold nav-auth-btn" id="${isMobile ? 'btn-mobile-login' : 'btn-nav-login'}">
            <span class="btn-icon">✦</span> Entrar
          </button>
        `;
      }

      const displayName = profile?.display_name || user.email?.split('@')[0] || 'Desperto';
      const isNarrator = profile?.role === 'narrator';
      const roleLabel = isNarrator ? 'Narrador' : 'Jogador';
      const targetHash = isNarrator ? '#/narrator' : '#/player';

      return `
        <div class="nav-user-badge">
          <a href="${targetHash}" class="nav-profile-pill" title="Minha Área (${roleLabel})">
            <span class="role-icon">${isNarrator ? '👁️' : '🛡️'}</span>
            <span class="user-name">${displayName}</span>
            <span class="role-tag role-${profile?.role || 'player'}">${roleLabel}</span>
          </a>
          <button type="button" class="nav-btn-icon" id="${isMobile ? 'btn-mobile-logout' : 'btn-nav-logout'}" title="Sair da Conta">
            ✕
          </button>
        </div>
      `;
    }

    if (userArea) {
      userArea.innerHTML = buildHtml(false);
      document.getElementById('btn-nav-login')?.addEventListener('click', () => showAuthModal());
      document.getElementById('btn-nav-logout')?.addEventListener('click', handleLogout);
    }

    if (mobileUserArea) {
      mobileUserArea.innerHTML = buildHtml(true);
      document.getElementById('btn-mobile-login')?.addEventListener('click', () => {
        window.ChronusRouter?.closeMobileMenu();
        showAuthModal();
      });
      document.getElementById('btn-mobile-logout')?.addEventListener('click', handleLogout);
    }
  }

  async function handleLogin(email, password) {
    const client = window.ChronusSupabase.getClient();
    if (!client) throw new Error('Conexão Supabase não disponível.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    currentProfile = await fetchProfile(data.user);
    updateNavAuthUi(currentUser, currentProfile);
    notifyAuthListeners(currentUser, currentProfile);
    hideAuthModal();
    return { user: currentUser, profile: currentProfile };
  }

  async function handleResetPassword(email) {
    const client = window.ChronusSupabase.getClient();
    if (!client) throw new Error('Conexão Supabase não disponível.');
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: passwordRedirectUrl()
    });
    if (error) throw error;
  }

  async function handleUpdatePassword(newPassword) {
    const client = window.ChronusSupabase.getClient();
    if (!client) throw new Error('Conexão Supabase não disponível.');
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function handleLogout() {
    if (!confirm('Deseja sair da sua conta CHRONUS neste dispositivo? Suas alterações salvas continuarão na nuvem.')) return;
    const client = window.ChronusSupabase.getClient();
    const cfg = window.CHRONUS_CONFIG;

    if (currentProfile?.role !== 'narrator' && localStorage.getItem(cfg.CLOUD_DIRTY_KEY) === '1') {
      if (!navigator.onLine) {
        alert('Há alterações na ficha ainda não sincronizadas. Conecte-se à internet antes de sair para não perder dados.');
        return;
      }
      if (window.ChronusSheetEngine?.pushStateToCloud) {
        await window.ChronusSheetEngine.pushStateToCloud();
      }
    }

    if (client) await client.auth.signOut();
    
    currentUser = null;
    currentProfile = null;
    localStorage.removeItem(cfg.STORAGE_KEY);
    cfg.LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(cfg.CLOUD_USER_KEY);
    localStorage.removeItem(cfg.CLOUD_CHARACTER_KEY);
    localStorage.removeItem(cfg.CLOUD_DIRTY_KEY);
    localStorage.removeItem(cfg.CLOUD_SYNCED_KEY);
    localStorage.removeItem(cfg.PORTRAIT_DIRTY_KEY);
    sessionStorage.removeItem(cfg.NARRATOR_VIEW_DATA_KEY);
    sessionStorage.removeItem(cfg.NARRATOR_VIEW_META_KEY);

    updateNavAuthUi(null, null);
    notifyAuthListeners(null, null);
    window.location.hash = '#/home';
    window.location.reload();
  }

  function showAuthModal(message = '', isError = false) {
    const modal = document.getElementById('authGate');
    const msgEl = document.getElementById('authMessage');
    if (!modal) return;
    modal.hidden = false;
    modal.style.display = 'flex';
    if (msgEl) {
      msgEl.textContent = message;
      msgEl.classList.toggle('is-error', isError);
    }
  }

  function hideAuthModal() {
    const modal = document.getElementById('authGate');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
  }

  function showPasswordModal(mode = 'change') {
    const modal = document.getElementById('passwordGate');
    const title = document.getElementById('passwordTitle');
    const subtitle = document.getElementById('passwordSubtitle');
    const msg = document.getElementById('passwordMessage');
    if (!modal) return;
    modal.hidden = false;
    modal.style.display = 'flex';
    if (msg) { msg.textContent = ''; msg.classList.remove('is-error'); }
    if (title) title.textContent = mode === 'recovery' ? 'Criar nova senha' : 'Alterar senha';
    if (subtitle) subtitle.textContent = mode === 'recovery'
      ? 'Você acessou pelo link de recuperação. Defina sua nova senha.'
      : 'Defina uma nova senha para sua conta CHRONUS.';
  }

  function hidePasswordModal() {
    const modal = document.getElementById('passwordGate');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
  }

  return {
    init,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    onAuthChange,
    handleLogin,
    handleLogout,
    handleResetPassword,
    handleUpdatePassword,
    showAuthModal,
    hideAuthModal,
    showPasswordModal,
    hidePasswordModal
  };
})();
