import crypto from 'node:crypto';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { decodePngDataUrl, inspectPng } from './png.mjs';
import { FlowerStore } from './store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');
const port = Number(process.env.PORT || 8787);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || '';
const databasePath = process.env.DATABASE_PATH || join(appRoot, 'data', 'flowers.json');
const uploadDir = process.env.UPLOAD_DIR || join(appRoot, 'public', 'uploads', 'flowers');
const paletteVersion = process.env.PALETTE_VERSION || 'studio-meadow-v1';
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((origin) => origin.trim());

const store = new FlowerStore(databasePath);
await store.load();
await mkdir(uploadDir, { recursive: true });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const recentSubmissions = new Map();

app.set('trust proxy', true);
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  })
);
app.use(express.json({ limit: process.env.JSON_LIMIT || '8mb' }));
app.use('/uploads', express.static(join(appRoot, 'public', 'uploads'), { immutable: false, maxAge: '5m' }));

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'studio-meadow-backend',
    flowers: store.getAcceptedFlowers().length
  });
});

app.post('/api/flowers', async (request, response, next) => {
  try {
    enforceRateLimit(request);

    const sessionId = normalizeText(request.body?.session_id, 128);
    if (!sessionId) {
      throw Object.assign(new Error('session_id is required'), { statusCode: 400 });
    }

    const name = normalizeText(request.body?.name, 48) || null;
    const buffer = decodePngDataUrl(request.body?.image_base64);
    const inspection = inspectPng(buffer);
    const id = crypto.randomUUID();
    const filename = `flower_${id}.png`;
    const filePath = join(uploadDir, filename);

    await writeFile(filePath, buffer, { flag: 'wx' });

    const createdAt = new Date().toISOString();
    const imageUrl = buildImageUrl(request, filename);
    const flower = {
      id,
      session_id: sessionId,
      name,
      image_url: imageUrl,
      thumb_url: null,
      created_at: createdAt,
      status: 'accepted',
      width: inspection.width,
      height: inspection.height,
      visible_pixel_count: inspection.visiblePixelCount,
      palette_version: paletteVersion,
      metadata: {
        placement: null,
        source: 'mobile_canvas',
        has_generated_stem: false,
        dominant_color: inspection.dominantColor
      }
    };

    await store.addFlower(flower);
    broadcastNewFlower(flower);

    response.status(201).json({
      ok: true,
      flower_id: id,
      message: 'Your flower is joining the meadow.'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/flowers/active', (_request, response) => {
  response.json({
    ok: true,
    flowers: store.getActiveFlowers()
  });
});

app.get('/api/flowers/recent', (request, response, next) => {
  try {
    response.json({
      ok: true,
      flowers: store.getRecentFlowers(request.query.since)
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    ok: false,
    error: statusCode >= 500 ? 'Internal server error' : error.message
  });
});

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'hello',
      active_count: store.getAcceptedFlowers().length,
      server_time: new Date().toISOString()
    })
  );
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Studio Meadow backend listening on http://localhost:${port}`);
});

function buildImageUrl(request, filename) {
  const baseUrl = publicBaseUrl || `${request.protocol}://${request.get('host')}`;
  return `${baseUrl.replace(/\/$/, '')}/uploads/flowers/${filename}`;
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function enforceRateLimit(request) {
  const now = Date.now();
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  const previous = recentSubmissions.get(ip) || [];
  const windowStart = now - 60_000;
  const current = previous.filter((timestamp) => timestamp > windowStart);

  if (current.length >= 20) {
    throw Object.assign(new Error('Too many submissions. Please wait a moment.'), { statusCode: 429 });
  }

  current.push(now);
  recentSubmissions.set(ip, current);
}

function broadcastNewFlower(flower) {
  const event = JSON.stringify({
    type: 'new_flower',
    flower
  });

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(event);
    }
  }
}
