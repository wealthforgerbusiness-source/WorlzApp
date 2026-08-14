{
  "name": "worlzapp-backend",
  "version": "1.0.0",
  "description": "WorlzApp - SaaS d'agents IA connectés à WhatsApp",
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.9",
    "@supabase/supabase-js": "^2.45.4",
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "qrcode": "^1.5.4",
    "node-cron": "^3.0.3",
    "pino": "^9.3.2",
    "@google/generative-ai": "^0.21.0"
  }
}
