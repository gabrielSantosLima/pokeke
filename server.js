import { createStaticServer } from './server/http.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 3000;

const server = await createStaticServer({ root, port });
console.log(`Pokeke rodando em http://localhost:${server.address().port}`);
