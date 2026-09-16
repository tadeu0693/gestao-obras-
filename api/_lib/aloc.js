// Acesso somente-leitura ao banco Redis da Central de Alocação (outro projeto, mesmo dono).
// Nunca escreve nada lá — só lê técnicos, projetos e alocações pra cruzar com o M.O daqui.
import { Redis } from '@upstash/redis';

const url = process.env.ALOC_REDIS_URL;
const token = process.env.ALOC_REDIS_TOKEN;

export function alocDisponivel() {
  return !!(url && token);
}

let cliente;
function redis() {
  if (!cliente) cliente = new Redis({ url, token });
  return cliente;
}

// Tenta alguns nomes de chave possíveis, e os dois formatos de armazenamento
// (hash por registro, ou uma string única com um JSON de array) até achar dados.
async function lerLista(chaves) {
  const r = redis();
  for (const k of chaves) {
    try {
      const v = await r.hgetall(k);
      if (v && Object.keys(v).length) return Object.values(v);
    } catch {
      // não é um hash nessa chave — tenta como string/JSON abaixo
    }
    try {
      const v = await r.get(k);
      if (v) {
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch {
      // segue tentando as próximas chaves
    }
  }
  return [];
}

export async function lerAlocacao() {
  const [tecnicos, projetos, allocations] = await Promise.all([
    lerLista(['tecnicos', 'aloc:tecnicos', 'ca:tecnicos']),
    lerLista(['projetos', 'aloc:projetos', 'ca:projetos']),
    lerLista(['allocations', 'aloc:allocations', 'ca:allocations']),
  ]);
  return { tecnicos, projetos, allocations };
}
