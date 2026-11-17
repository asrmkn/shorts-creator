import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './db';
import { createApp } from './app';

// Route AI/upload fetch() calls through HTTPS_PROXY / HTTP_PROXY from .env (Node 24+).
const proxyFromEnv = (http as unknown as { setGlobalProxyFromEnv?: () => void }).setGlobalProxyFromEnv;
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && proxyFromEnv) proxyFromEnv();

const port = Number(process.env.PORT || 5174);
const store = new Store();
const { app, publisher } = createApp(store);
publisher.start();

// Serve the production build when available (`npm run build` then `npm start`).
const clientDist = path.resolve('dist', 'client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|media).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(port, () => {
  console.log(`StuntShorts Studio API on http://localhost:${port}`);
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) console.log(`Using proxy ${process.env.HTTPS_PROXY || process.env.HTTP_PROXY} for outbound calls`);
});
