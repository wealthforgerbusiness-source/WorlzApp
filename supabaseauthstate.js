const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const supabaseAdmin = require('./supabaseAdmin');

/**
 * Remplace useMultiFileAuthState() de Baileys (qui écrit sur disque) par un stockage
 * en base Supabase — nécessaire car Render redémarre le service et efface le disque.
 */
async function useSupabaseAuthState(userId) {
  let creds;
  let keys = {};

  const { data } = await supabaseAdmin
    .from('bot_sessions')
    .select('auth_creds')
    .eq('user_id', userId)
    .single();

  if (data && data.auth_creds) {
    const parsed = JSON.parse(JSON.stringify(data.auth_creds), BufferJSON.reviver);
    creds = parsed.creds || initAuthCreds();
    keys = parsed.keys || {};
  } else {
    creds = initAuthCreds();
  }

  const persist = async () => {
    const toSave = JSON.parse(JSON.stringify({ creds, keys }, BufferJSON.replacer));
    await supabaseAdmin
      .from('bot_sessions')
      .update({ auth_creds: toSave, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            let value = keys[type] && keys[type][id];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value;
            }
          }
          return result;
        },
        set: async (data) => {
          for (const category in data) {
            keys[category] = keys[category] || {};
            Object.assign(keys[category], data[category]);
          }
          await persist();
        }
      }
    },
    saveCreds: persist,
    clearCreds: async () => {
      keys = {};
      creds = initAuthCreds();
      await supabaseAdmin
        .from('bot_sessions')
        .update({ auth_creds: null, statut: 'deconnecte', actif: false })
        .eq('user_id', userId);
    }
  };
}

module.exports = { useSupabaseAuthState };
