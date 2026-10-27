import express from 'express';
import { resolve } from 'node:path';
import { Store } from './store.js';
import { createApp } from './app.js';

const store = new Store(process.env.DB_PATH || 'data/jytodo.sqlite');
const { app, integrations } = createApp(store);
const production = process.argv.includes('--production');
let vite;
if (production) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`JYTODO listening on port ${process.env.PORT || 3000} (${production ? 'production' : 'development'})`));
const timer = setInterval(() => integrations.deliverSlack().catch(() => {}), 5000);
async function shutdown() { clearInterval(timer); server.close(); await vite?.close(); store.close(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
