// Armazenamento: Upstash Redis em produção (Vercel). Em desenvolvimento local,
// sem as variáveis do Upstash, usa um arquivo JSON em .data/db.json.
import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

const PREFIX = process.env.DB_PREFIX || 'go:';
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const COLECOES = ['clientes', 'orcamentos', 'locais', 'estoque', 'tabelaMO'];

let impl;

if (url && token) {
  const redis = new Redis({ url, token });
  impl = {
    async hgetall(key) {
      return (await redis.hgetall(PREFIX + key)) || {};
    },
    async hget(key, field) {
      return (await redis.hget(PREFIX + key, field)) ?? null;
    },
    async hset(key, obj) {
      if (Object.keys(obj).length) await redis.hset(PREFIX + key, obj);
    },
    async hdel(key, field) {
      await redis.hdel(PREFIX + key, field);
    },
    async del(key) {
      await redis.del(PREFIX + key);
    },
    async incrWithTtl(key, ttlSec) {
      const n = await redis.incr(PREFIX + key);
      if (n === 1) await redis.expire(PREFIX + key, ttlSec);
      return n;
    },
  };
} else if (process.env.VERCEL) {
  // Na Vercel sem banco: qualquer operação avisa o que falta configurar
  const falha = async () => {
    throw new Error('Banco não configurado: conecte o Upstash Redis ao projeto na Vercel (Storage).');
  };
  impl = { hgetall: falha, hget: falha, hset: falha, hdel: falha, del: falha, incrWithTtl: falha };
} else {
  const file = path.resolve(process.cwd(), '.data/db.json');
  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const save = (d) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(d));
  };
  impl = {
    async hgetall(key) {
      return load()[key] || {};
    },
    async hget(key, field) {
      return (load()[key] || {})[field] ?? null;
    },
    async hset(key, obj) {
      const d = load();
      d[key] = { ...(d[key] || {}), ...JSON.parse(JSON.stringify(obj)) };
      save(d);
    },
    async hdel(key, field) {
      const d = load();
      if (d[key]) delete d[key][field];
      save(d);
    },
    async del(key) {
      const d = load();
      delete d[key];
      save(d);
    },
    async incrWithTtl(key) {
      const d = load();
      d.__cnt = d.__cnt || {};
      d.__cnt[key] = (d.__cnt[key] || 0) + 1;
      save(d);
      return d.__cnt[key];
    },
  };
}

export const db = impl;

// Lista o que falta configurar quando roda na Vercel
export function configPendente() {
  if (!process.env.VERCEL) return [];
  const f = [];
  if (!(url && token)) f.push('Banco Upstash Redis (UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN, ou KV_REST_API_URL e KV_REST_API_TOKEN)');
  if (!process.env.JWT_SECRET) f.push('JWT_SECRET');
  return f;
}

export async function lerTudo() {
  const out = {};
  for (const c of COLECOES) out[c] = Object.values(await db.hgetall(c));
  return out;
}
