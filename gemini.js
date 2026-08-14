const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Génère une réponse IA pour un message WhatsApp entrant.
 * @param {string} personnalite - instructions système définies par l'utilisateur (ton, rôle du bot)
 * @param {string} messageEntrant - le message reçu du client final sur WhatsApp
 * @returns {Promise<string>}
 */
async function genererReponse(personnalite, messageEntrant) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `${personnalite}

Réponds au message suivant de façon naturelle, courte (2-4 phrases max), comme sur WhatsApp, en français sauf si le client écrit dans une autre langue :

Message du client : "${messageEntrant}"`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    console.error('[gemini] erreur génération:', e.message);
    return "Merci pour votre message, nous revenons vers vous rapidement.";
  }
}

module.exports = { genererReponse };
