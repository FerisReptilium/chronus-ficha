/**
 * CHRONUS — ECOLOGIA SOBRENATURAL
 * Configurações Globais e Chaves de Armazenamento com Escopo por Usuário
 */
window.CHRONUS_CONFIG = {
  SUPABASE_URL: 'https://phxqtkdumgwacrqsflqe.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_nl4ksY4d4ZFWENQ1_93wQQ_MXHih6uK',
  
  // Chaves Legadas para Migração Transparente
  LEGACY_STORAGE_KEY: 'chronus.sheet.v4',
  LEGACY_KEYS: ['chronus.sheet.v4', 'chronus.sheet.v3', 'chronus.sheet.v2', 'chronus.sheet.v1'],
  LEGACY_USER_KEY: 'chronus.cloud.user.v1',

  // Chaves da Sessão do Narrador (Somente Leitura)
  NARRATOR_VIEW_DATA_KEY: 'chronus.narrator.view.data.v1',
  NARRATOR_VIEW_META_KEY: 'chronus.narrator.view.meta.v1',

  // Geradores de Chaves com Escopo por User ID (Isolamento de Cache Multi-Usuário)
  getStorageKey: (userId) => userId ? `chronus.sheet.${userId}` : 'chronus.sheet.anonymous',
  getCharacterIdKey: (userId) => userId ? `chronus.cloud.character.${userId}` : 'chronus.cloud.character.anonymous',
  getDirtyKey: (userId) => userId ? `chronus.cloud.dirty.${userId}` : 'chronus.cloud.dirty.anonymous',
  getSyncedKey: (userId) => userId ? `chronus.cloud.synced.${userId}` : 'chronus.cloud.synced.anonymous',
  getPortraitDirtyKey: (userId) => userId ? `chronus.cloud.portrait.dirty.${userId}` : 'chronus.cloud.portrait.dirty.anonymous',

  // Dimensões da Ficha Digital v0.6.1
  SHEET_W: 1449,
  SHEET_H: 2048,

  // Versão do Portal
  PORTAL_VERSION: '1.0.1-phase2a'
};
