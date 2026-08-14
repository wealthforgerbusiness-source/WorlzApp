const supabaseAdmin = require('./supabaseAdmin');

// Vérifie le header "Authorization: Bearer <token>" envoyé par le frontend
// (le token vient de supabase.auth.getSession() côté client après connexion).
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Non authentifié.' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Session invalide, reconnectez-vous.' });

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (e) {
    console.error('[requireAuth] erreur:', e.message);
    res.status(401).json({ error: 'Authentification échouée.' });
  }
}

module.exports = requireAuth;
