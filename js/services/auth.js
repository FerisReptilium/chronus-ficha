/**
 * CHRONUS — Authentication & User Profile Service (Única Autoridade de Autenticação)
 * Controla: Supabase Auth, Sessão, Perfis, Login, Logout Seguro com Confirmação e Recuperação de Senha.
 */
window.ChronusAuth = (function() {
  let currentUser = null;
  let currentProfile = null;
  let passwordRecoveryAuthorized = false;
  let isLoggingOut = false;
  const authListeners = [];

  function onAuthChange(cb) {
    if (typeof cb === 'function') {
      authListeners.push(cb);
      if (currentUser !== undefined) {
        try { cb(currentUser, currentProfile); } catch (e) { console.error('Auth listener error:', e); }
      }
    }
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
      notifyAuthListeners(null, null);
      return;
    }

    const recoveryCallback = getPasswordRecoveryCallback();

    // ÚNICO LISTENER GLOBAL DE AUTENTICAÇÃO (SÍNCRONO - ZERO DEADLOCK)
    client.auth.onAuthStateChange((event, session) => {
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
        const eventUserId = session.user.id;
        // Deferir processamento assíncrono para fora do callback interno do Supabase
        setTimeout(async () => {
          const profile = await fetchProfile(session.user);
          if ((currentUser?.id || null) !== eventUserId) return;
          currentProfile = profile;
          updateNavAuthUi(currentUser, currentProfile);
          notifyAuthListeners(currentUser, currentProfile);
        }, 0);
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
        if (window.location.hash === '#/login') {
          showAuthModal();
        }
      }
    } catch (e) {
      console.warn('CHRONUS: Erro ao checar sessão inicial:', e);
      updateNavAuthUi(null, null);
      notifyAuthListeners(null, null);
    }
  }

  function updateNavAuthUi(user, profile) {
    const userArea = document.getElementById('nav-user-area');
    const mobileUserArea = document.getElementById('mobile-nav-user-area');

    function createElement(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined && text !== null) element.textContent = String(text);
      return element;
    }

    function buildAuthNode(isMobile = false) {
      if (!user) {
        const login = createElement('button', 'portal-btn portal-btn-gold nav-auth-btn');
        login.type = 'button';
        login.id = isMobile ? 'btn-mobile-login' : 'btn-nav-login';
        login.append(createElement('span', 'btn-icon', '✦'), document.createTextNode(' Entrar'));
        return login;
      }

      const displayName = profile?.display_name || user.email?.split('@')[0] || 'Desperto';
      const isNarrator = profile?.role === 'narrator';
      const roleLabel = isNarrator ? 'Narrador' : 'Jogador';
      const targetHash = isNarrator ? '#/narrator' : '#/player';

      const badge = createElement('div', 'nav-user-badge');
      const profileLink = createElement('a', 'nav-profile-pill');
      profileLink.href = targetHash;
      profileLink.title = `Minha Área (${roleLabel})`;
      profileLink.append(
        createElement('span', 'role-icon', isNarrator ? '👁️' : '🛡️'),
        createElement('span', 'user-name', displayName),
        createElement('span', `role-tag role-${isNarrator ? 'narrator' : 'player'}`, roleLabel)
      );

      const logout = createElement('button', 'nav-btn-icon', '✕');
      logout.type = 'button';
      logout.id = isMobile ? 'btn-mobile-logout' : 'btn-nav-logout';
      logout.title = 'Sair da Conta';
      badge.append(profileLink, logout);
      return badge;
    }

    if (userArea) {
      userArea.replaceChildren(buildAuthNode(false));
      userArea.querySelector('#btn-nav-login')?.addEventListener('click', () => showAuthModal());
      userArea.querySelector('#btn-nav-logout')?.addEventListener('click', handleLogout);
    }

    if (mobileUserArea) {
      mobileUserArea.replaceChildren(buildAuthNode(true));
      mobileUserArea.querySelector('#btn-mobile-login')?.addEventListener('click', () => {
        window.ChronusRouter?.closeMobileMenu();
        showAuthModal();
      });
      mobileUserArea.querySelector('#btn-mobile-logout')?.addEventListener('click', handleLogout);
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

  /**
   * FLUXO DE LOGOUT SEGURO COM CONFIRMAÇÃO DE SINCRONIZAÇÃO
   * Se houver alterações pendentes (dirty), o logout SÓ PROSSEGUE se o Supabase confirmar sucesso.
   * Em caso de falha de conexão, timeout ou erro 500, o logout é CANCELADO e os dados locais são preservados.
   */
  async function handleLogout() {
    if (isLoggingOut) return;
    if (!confirm('Deseja sair da sua conta CHRONUS neste dispositivo?')) return;

    isLoggingOut = true;
    const client = window.ChronusSupabase.getClient();
    const cfg = window.CHRONUS_CONFIG;
    const userId = currentUser?.id;

    try {
      const isDirty = window.ChronusSheetEngine?.isDirty ? window.ChronusSheetEngine.isDirty() : false;
      const dirtyKeyVal = userId ? localStorage.getItem(cfg.getDirtyKey(userId)) : null;

      if (currentProfile?.role !== 'narrator' && (isDirty || dirtyKeyVal === '1')) {
        // Tenta sincronização com confirmação estrita
        if (window.ChronusSheetEngine?.pushStateToCloud) {
          const syncResult = await window.ChronusSheetEngine.pushStateToCloud();
          
          if (!syncResult || !syncResult.ok) {
            // BLOQUEIA O LOGOUT — PRESERVAÇÃO TOTAL DOS DADOS
            alert('⚠️ AVISO DE SEGURANÇA: Não foi possível sincronizar suas alterações com o servidor (falha de rede ou nuvem indisponível).\n\nO logout foi CANCELADO para que seus dados locais não sejam perdidos. Tente novamente quando a conexão estiver restabelecida.');
            isLoggingOut = false;
            return false;
          }
        }
      }

      // Sucesso confirmado ou sem pendências -> Prossegue com o logout
      if (client) await client.auth.signOut();

      // Limpar apenas referências de sessão ativa, preservando o cache local individual do usuário
      sessionStorage.removeItem(cfg.NARRATOR_VIEW_DATA_KEY);
      sessionStorage.removeItem(cfg.NARRATOR_VIEW_META_KEY);

      currentUser = null;
      currentProfile = null;
      updateNavAuthUi(null, null);
      notifyAuthListeners(null, null);

      window.location.hash = '#/home';
      window.location.reload();
      return true;
    } catch (err) {
      console.error('CHRONUS: Erro durante logout seguro:', err);
      alert('Não foi possível concluir o logout com segurança: ' + (err.message || err));
      isLoggingOut = false;
      return false;
    } finally {
      isLoggingOut = false;
    }
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
