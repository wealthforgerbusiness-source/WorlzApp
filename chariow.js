const crypto = require('crypto');
const supabaseAdmin = require('./supabaseAdmin');

const SUBSCRIPTION_DAYS = parseInt(process.env.SUBSCRIPTION_DAYS || '30', 10);

/**
 * Vérifie la signature du webhook Chariow.
 * ⚠️ Adapte cette fonction au format exact fourni par la doc Chariow pour ton compte
 * (header du nom de la signature + algorithme). Chariow évoluant, vérifie sur
 * ton dashboard > Webhooks > Documentation avant la mise en prod.
 */
function verifierSignature(payloadBrut, signatureRecue) {
  if (!process.env.CHARIOW_WEBHOOK_SECRET) return true; // à activer une fois le secret configuré
  const attendu = crypto
    .createHmac('sha256', process.env.CHARIOW_WEBHOOK_SECRET)
    .update(payloadBrut)
    .digest('hex');
  return signatureRecue === attendu;
}

/**
 * Traite un paiement confirmé : active/prolonge l'abonnement de l'utilisateur.
 * @param {object} payload - corps du webhook Chariow (adapter les noms de champs à ta config)
 */
async function traiterPaiementConfirme(payload) {
  const email = payload.customer_email || payload.email;
  const orderId = payload.order_id || payload.id;
  const montant = payload.amount || payload.montant || null;

  if (!email) throw new Error('Email client manquant dans le webhook Chariow');

  const { data: profil } = await supabaseAdmin
    .from('profiles').select('id').eq('email', email).single();
  if (!profil) throw new Error(`Aucun compte WorlzApp trouvé pour ${email}`);

  const maintenant = new Date();
  const { data: abonnementActuel } = await supabaseAdmin
    .from('subscriptions').select('*').eq('user_id', profil.id)
    .order('created_at', { ascending: false }).limit(1).single();

  // Si un abonnement actif existe déjà et n'est pas expiré, on prolonge à partir de sa date de fin.
  // Sinon on repart d'aujourd'hui.
  const baseDate = (abonnementActuel && abonnementActuel.expire_le && new Date(abonnementActuel.expire_le) > maintenant)
    ? new Date(abonnementActuel.expire_le)
    : maintenant;
  const expireLe = new Date(baseDate.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

  await supabaseAdmin.from('subscriptions').insert({
    user_id: profil.id,
    status: 'active',
    montant,
    chariow_order_id: String(orderId),
    demarre_le: maintenant.toISOString(),
    expire_le: expireLe.toISOString()
  });

  return { userId: profil.id, expireLe };
}

module.exports = { verifierSignature, traiterPaiementConfirme };
