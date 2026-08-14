const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const { useSupabaseAuthState } = require('./supabaseAuthState');
const supabaseAdmin = require('./supabaseAdmin');
const { genererReponse } = require('./gemini');

// Sockets actifs en mémoire, un par utilisateur connecté sur ce serveur.
// (En cas de scale multi-instances plus tard, il faudrait un sticky-routing par userId.)
const sockets = new Map();   // userId -> socket Baileys
const qrCodes = new Map();   // userId -> QR code en data URL (le temps du scan)
const statuts = new Map();   // userId -> 'attente_scan' | 'connecte' | 'deconnecte'

async function estAbonnementActif(userId) {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('status, expire_le')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!data) return false;
  if (data.status !== 'active') return false;
  if (data.expire_le && new Date(data.expire_le) < new Date()) return false;
  return true;
}

async function demarrerSession(userId) {
  if (sockets.has(userId)) {
    const existing = statuts.get(userId);
    if (existing === 'connecte' || existing === 'attente_scan') return { statut: existing };
  }

  const abonnementOk = await estAbonnementActif(userId);
  if (!abonnementOk) {
    return { erreur: 'Abonnement inactif. Réactivez votre abonnement pour connecter le bot.' };
  }

  const { state, saveCreds } = await useSupabaseAuthState(userId);
  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: ['WorlzApp', 'Chrome', '1.0']
  });

  sockets.set(userId, sock);
  statuts.set(userId, 'attente_scan');

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodes.set(userId, await QRCode.toDataURL(qr));
      statuts.set(userId, 'attente_scan');
    }

    if (connection === 'open') {
      qrCodes.delete(userId);
      statuts.set(userId, 'connecte');
      await supabaseAdmin.from('bot_sessions')
        .update({ statut: 'connecte', actif: true, derniere_connexion: new Date().toISOString() })
        .eq('user_id', userId);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      statuts.set(userId, 'deconnecte');
      sockets.delete(userId);
      await supabaseAdmin.from('bot_sessions').update({ statut: 'deconnecte' }).eq('user_id', userId);

      // 401 = déconnecté depuis le téléphone (logout) -> il faudra rescanner un nouveau QR
      // tout autre code -> coupure réseau, on retente une reconnexion silencieuse
      if (code !== DisconnectReason.loggedOut) {
        const { data } = await supabaseAdmin.from('bot_sessions').select('actif').eq('user_id', userId).single();
        if (data && data.actif) demarrerSession(userId).catch(() => {});
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const abonnementToujoursOk = await estAbonnementActif(userId);
    if (!abonnementToujoursOk) return;

    const texte = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!texte) return;

    const { data: session } = await supabaseAdmin
      .from('bot_sessions').select('personnalite, actif').eq('user_id', userId).single();
    if (!session || !session.actif) return;

    const reponse = await genererReponse(session.personnalite, texte);
    await sock.sendMessage(msg.key.remoteJid, { text: reponse });
  });

  return { statut: 'attente_scan' };
}

async function arreterSession(userId, { supprimerCreds = false } = {}) {
  const sock = sockets.get(userId);
  if (sock) {
    try { sock.end(undefined); } catch (e) { /* déjà fermé */ }
    sockets.delete(userId);
  }
  qrCodes.delete(userId);
  statuts.set(userId, 'deconnecte');

  if (supprimerCreds) {
    const { useSupabaseAuthState: uas } = require('./supabaseAuthState');
    const { clearCreds } = await uas(userId);
    await clearCreds();
  } else {
    await supabaseAdmin.from('bot_sessions').update({ statut: 'deconnecte', actif: false }).eq('user_id', userId);
  }
}

function getStatut(userId) {
  return {
    statut: statuts.get(userId) || 'deconnecte',
    qr: qrCodes.get(userId) || null
  };
}

module.exports = { demarrerSession, arreterSession, getStatut, estAbonnementActif };
