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

// Tenta alguns nomes de chave possíveis (com e sem prefixo) até achar dados.
async function hgetallTentativas(chaves) {
  const r = redis();
  for (const k of chaves) {
    const v = await r.hgetall(k);
    if (v && Object.keys(v).length) return Object.values(v);
  }
  return [];
}

export async function lerAlocacao() {
  const [tecnicos, projetos, allocations] = await Promise.all([
    hgetallTentativas(['tecnicos', 'aloc:tecnicos', 'ca:tecnicos']),
    hgetallTentativas(['projetos', 'aloc:projetos', 'ca:projetos']),
    hgetallTentativas(['allocations', 'aloc:allocations', 'ca:allocations']),
  ]);
  return { tecnicos, projetos, allocations };
}
