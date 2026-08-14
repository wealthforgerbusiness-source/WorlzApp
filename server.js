require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const supabaseAdmin = require('./lib/supabaseAdmin');
const sessionManager = require('./lib/sessionManager');
const botRoutes = require('./routes/bot');
const webhookRoutes = require('./routes/webhook');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/bot', botRoutes);
app.use('/api/webhook', webhookRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, heure: new Date().toISOString() }));

// Config publique (rien de sensible) utilisée par le frontend pour le bouton de paiement
app.get('/api/config', (req, res) => {
  res.json({ chariowUrl: process.env.CHARIOW_PRODUCT_URL || '' });
});

// ===========================================================================
// Tâche planifiée : tous les jours à 00h10, coupe le bot des abonnements expirés.
// ===========================================================================
cron.schedule('10 0 * * *', async () => {
  console.log('[cron] vérification des abonnements expirés…');
  const maintenant = new Date().toISOString();

  const { data: expires } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, expire_le, status')
    .eq('status', 'active')
    .lt('expire_le', maintenant);

  if (!expires || expires.length === 0) {
    console.log('[cron] aucun abonnement à expirer.');
    return;
  }

  for (const abo of expires) {
    await supabaseAdmin.from('subscriptions').update({ status: 'expired' }).eq('user_id', abo.user_id).eq('status', 'active');
    await sessionManager.arreterSession(abo.user_id); // coupe le bot, garde les identifiants WhatsApp pour la réactivation
    console.log(`[cron] bot désactivé (abonnement expiré) pour ${abo.user_id}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WorlzApp backend démarré sur le port ${PORT}`);
});
