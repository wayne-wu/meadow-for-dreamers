import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const EMPTY_STATE = {
  meadowSessions: [],
  activeMeadowSessionId: null,
  flowers: [],
  latestBySession: {}
};

export class FlowerStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      meadowSessions: [],
      activeMeadowSessionId: null,
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

      this.state = normalizeState(parsed);
      await this.ensureActiveMeadowSession();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.ensureActiveMeadowSession();
    }
  }

  async ensureActiveMeadowSession() {
    if (this.state.activeMeadowSessionId && this.getMeadowSession(this.state.activeMeadowSessionId)) {
      return this.getMeadowSession(this.state.activeMeadowSessionId);
    }

    const session = this.createMeadowSessionRecord('Opening Meadow');
    this.state.meadowSessions.push(session);
    this.state.activeMeadowSessionId = session.id;

    for (const flower of this.state.flowers) {
      if (!flower.meadow_session_id) {
        flower.meadow_session_id = session.id;
      }
    }

    await this.save();
    return session;
  }

  async startMeadowSession(name) {
    const session = this.createMeadowSessionRecord(name || `Meadow ${this.state.meadowSessions.length + 1}`);
    this.state.meadowSessions.push(session);
    this.state.activeMeadowSessionId = session.id;
    await this.save();
    return session;
  }

  getMeadowSessions() {
    return [...this.state.meadowSessions].sort(compareStartedAt);
  }

  getActiveMeadowSession() {
    return this.getMeadowSession(this.state.activeMeadowSessionId);
  }

  getMeadowSession(id) {
    return this.state.meadowSessions.find((session) => session.id === id) || null;
  }

  async addFlower(flower) {
    this.state.flowers.push(flower);

    if (flower.session_id && flower.meadow_session_id) {
      this.state.latestBySession[`${flower.meadow_session_id}:${flower.session_id}`] = flower.id;
    }

    await this.save();
    return flower;
  }

  async deleteFlower(flowerId) {
    const flowerIndex = this.state.flowers.findIndex((flower) => flower.id === flowerId);

    if (flowerIndex === -1) {
      return null;
    }

    const [deletedFlower] = this.state.flowers.splice(flowerIndex, 1);
    this.rebuildLatestBySession();
    await this.save();
    return deletedFlower;
  }

  getAcceptedFlowers() {
    return this.state.flowers.filter((flower) => flower.status === 'accepted');
  }

  getActiveFlowers(meadowSessionId = this.state.activeMeadowSessionId) {
    return this.getAcceptedFlowers()
      .filter((flower) => flower.meadow_session_id === meadowSessionId)
      .sort(compareCreatedAt);
  }

  getRecentFlowers(since, meadowSessionId = this.state.activeMeadowSessionId) {
    const sinceMs = parseSince(since);

    return this.getAcceptedFlowers()
      .filter((flower) => flower.meadow_session_id === meadowSessionId)
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

  createMeadowSessionRecord(name) {
    const now = new Date().toISOString();

    return {
      id: cryptoRandomId(),
      name,
      started_at: now,
      status: 'active'
    };
  }

  rebuildLatestBySession() {
    const nextLatestBySession = {};

    for (const flower of this.getAcceptedFlowers().sort(compareCreatedAt)) {
      if (flower.session_id && flower.meadow_session_id) {
        nextLatestBySession[`${flower.meadow_session_id}:${flower.session_id}`] = flower.id;
      }
    }

    this.state.latestBySession = nextLatestBySession;
  }
}

function compareCreatedAt(left, right) {
  return Date.parse(left.created_at) - Date.parse(right.created_at);
}

function compareStartedAt(left, right) {
  return Date.parse(left.started_at) - Date.parse(right.started_at);
}

function normalizeState(parsed) {
  const state = {
    meadowSessions: Array.isArray(parsed.meadowSessions) ? parsed.meadowSessions : [],
    activeMeadowSessionId: typeof parsed.activeMeadowSessionId === 'string' ? parsed.activeMeadowSessionId : null,
    flowers: Array.isArray(parsed.flowers) ? parsed.flowers : [],
    latestBySession: parsed.latestBySession && typeof parsed.latestBySession === 'object' ? parsed.latestBySession : {}
  };

  if (!state.activeMeadowSessionId && state.meadowSessions.length > 0) {
    state.activeMeadowSessionId = state.meadowSessions[state.meadowSessions.length - 1].id;
  }

  if (state.activeMeadowSessionId) {
    for (const flower of state.flowers) {
      if (!flower.meadow_session_id) {
        flower.meadow_session_id = state.activeMeadowSessionId;
      }
    }
  }

  return state;
}

function cryptoRandomId() {
  return crypto.randomUUID();
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
