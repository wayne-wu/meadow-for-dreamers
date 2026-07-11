import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const EMPTY_STATE = {
  flowers: [],
  latestBySession: {}
};

export class FlowerStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      flowers: [],
      latestBySession: {}
    };
    this.writeQueue = Promise.resolve();
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);

      this.state = {
        flowers: Array.isArray(parsed.flowers) ? parsed.flowers : [],
        latestBySession: parsed.latestBySession && typeof parsed.latestBySession === 'object' ? parsed.latestBySession : {}
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  async addFlower(flower) {
    this.state.flowers.push(flower);

    if (flower.session_id) {
      this.state.latestBySession[flower.session_id] = flower.id;
    }

    await this.save();
    return flower;
  }

  getAcceptedFlowers() {
    return this.state.flowers.filter((flower) => flower.status === 'accepted');
  }

  getActiveFlowers() {
    return this.getAcceptedFlowers().sort(compareCreatedAt);
  }

  getRecentFlowers(since) {
    const sinceMs = parseSince(since);

    return this.getAcceptedFlowers()
      .filter((flower) => (sinceMs == null ? true : Date.parse(flower.created_at) > sinceMs))
      .sort(compareCreatedAt);
  }

  async save() {
    this.writeQueue = this.writeQueue.then(async () => {
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(this.state, null, 2)}\n`);
      await rename(tempPath, this.filePath);
    });

    await this.writeQueue;
  }
}

function compareCreatedAt(left, right) {
  return Date.parse(left.created_at) - Date.parse(right.created_at);
}

function parseSince(since) {
  if (!since) return null;

  const numeric = Number(since);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = Date.parse(since);
  if (Number.isNaN(parsed)) {
    throw Object.assign(new Error('since must be an ISO timestamp or epoch milliseconds'), { statusCode: 400 });
  }

  return parsed;
}
