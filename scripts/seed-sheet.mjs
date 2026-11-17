// Uso local:  SHEET_ID=... GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":...}' npm run seed
// (También se puede hacer desde la app publicada: /api/setup?secret=<CRON_SECRET>)
import { prepararSheet } from '../api/_lib/seed.js';

for (const l of await prepararSheet()) console.log(l);
console.log('Listo.');
