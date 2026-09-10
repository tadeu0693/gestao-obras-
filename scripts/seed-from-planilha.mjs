// Converte a planilha "Projetos_Gerais_SP.xlsx" (CPFL) em um backup JSON
// que pode ser importado em Configurações > Importar backup.
// Uso: node scripts/seed-from-planilha.mjs caminho/Projetos_Gerais_SP.xlsx saida.json
import * as XLSX from 'xlsx';
import fs from 'fs';
import { parseWorkbook } from '../src/lib/parseProposta.js';

const [, , input = 'Projetos_Gerais_SP.xlsx', output = 'dados-iniciais-cpfl.json'] = process.argv;
const wb = XLSX.read(fs.readFileSync(input), { type: 'buffer', cellDates: true });
const grid = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = new Date().toISOString();
const iso = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : '');
const hora = (v) => (v instanceof Date ? v.toISOString().slice(11, 16) : typeof v === 'number' ? `${String(Math.floor(v * 24)).padStart(2, '0')}:${String(Math.round((v * 1440) % 60)).padStart(2, '0')}` : '');
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ---------- matching de nomes de locais ----------
const deaccent = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function tipoENome(raw) {
  let s = deaccent(raw).replace(/\(.*?\)/g, ' ').replace(/[_]/g, ' ');
  const tipos = new Set();
  const m = s.match(/^\s*(rpc\/)?(ea\s*\/\s*se|se\s*\/\s*ea|ease|ea|se)\b/);
  if (m) {
    const t = m[2].replace(/\s/g, '');
    if (t.includes('ea')) tipos.add('ea');
    if (t.includes('se')) tipos.add('se');
    s = s.slice(m[0].length);
  }
  const tokens = s.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !['de', 'da', 'do', 'vila', 'e'].includes(t));
  return { tipos, tokens };
}
function bigr(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function score(a, b) {
  const A = tipoENome(a), B = tipoENome(b);
  const sa = A.tokens.join(''), sb = B.tokens.join('');
  const ba = bigr(sa), bb = bigr(sb);
  let inter = 0;
  ba.forEach((x) => bb.has(x) && inter++);
  let s = (2 * inter) / (ba.size + bb.size || 1);
  if (A.tipos.size && B.tipos.size) {
    const eq = [...A.tipos].every((t) => B.tipos.has(t)) && A.tipos.size === B.tipos.size;
    const comp = [...A.tipos].some((t) => B.tipos.has(t));
    s += eq ? 0.15 : comp ? 0.05 : -0.3;
  }
  return s;
}
function melhor(nome, locais, po) {
  const cands = locais.filter((l) => !po || String(l.po) === String(po));
  let best = null, bs = 0;
  for (const l of cands) {
    const s = score(nome, l.nome);
    if (s > bs) { bs = s; best = l; }
  }
  return bs >= 0.55 ? best : null;
}
const log = [];

// ---------- cliente ----------
const cliente = { id: uid(), nome: 'CPFL', obs: 'Importado da planilha Projetos_Gerais_SP', criadoEm: now };

// ---------- orçamentos (abas OP) ----------
const orcamentos = wb.SheetNames.filter((s) => /^OP\s*\d+/i.test(s)).map((s) => {
  const single = { SheetNames: [s], Sheets: { [s]: wb.Sheets[s] } };
  const r = parseWorkbook(single, s);
  const po = (s.match(/OP\s*(\d+)/i) || [])[1];
  return {
    ...r.orcamento,
    id: uid(),
    clienteId: cliente.id,
    po,
    nome: s.replace(/^OP\s*\d+\s*-\s*/i, '').trim(),
    arquivoOrigem: 'Projetos_Gerais_SP.xlsx › ' + s,
    status: 'Aprovado',
    criadoEm: now,
    atualizadoEm: now,
  };
});
orcamentos.forEach((o) => delete o.clienteNome);

// ---------- locais (Status de Projeto) ----------
const locais = [];
grid('Status de Projeto').slice(1).forEach((r) => {
  if (!r[0]) return;
  locais.push({
    id: uid(),
    clienteId: cliente.id,
    po: String(r[1] ?? ''),
    nome: clean(r[0]),
    endereco: clean(r[2]),
    regiao: clean(r[3]),
    status: clean(r[4]) || 'Não iniciada',
    equipe: clean(r[5]),
    inicioPrevisto: iso(r[6]),
    fimPrevisto: iso(r[7]),
    inicioReal: '',
    fimReal: '',
    obs: clean(r[8]),
    moUnit: 0,
    miscUnit: 0,
    valorTerceiro: 0,
    cameras: { bullet: 0, dome: 0, ptz: 0, radar: 0, sonofletor: 0 },
    postes: { qtd: 0, dataEntrega: '', horaEntrega: '', rota: '', sequencia: '' },
    levantamento: [],
    criadoEm: now,
    atualizadoEm: now,
  });
});

// ---------- Por Região: equipe, M.O, misc, terceiro ----------
let equipeRegiao = '';
grid('Por Região').forEach((r) => {
  const a = clean(r[0]);
  if (/^REGI[AÃ]O/i.test(a)) { equipeRegiao = ''; return; }
  if (!a || /^local$|^total/i.test(a) || !r[1]) return;
  if (clean(r[3])) equipeRegiao = clean(r[3]);
  const l = melhor(a, locais, r[1]);
  if (!l) return log.push(`Por Região: sem par para "${a}"`);
  l.equipe = l.equipe || equipeRegiao;
  l.moUnit = n(r[4]);
  l.miscUnit = n(r[5]);
  l.valorTerceiro = n(r[8]) || n(r[9]);
});

// ---------- Projetos por Região: câmeras ----------
grid('Projetos por Região').forEach((r) => {
  const a = clean(r[0]);
  if (!a || /^REGI|^local$|^projetos/i.test(a) || !r[1]) return;
  const l = melhor(a, locais, r[1]);
  if (!l) return log.push(`Projetos por Região: sem par para "${a}"`);
  l.cameras = { bullet: n(r[3]), dome: n(r[4]), ptz: n(r[5]), radar: n(r[6]), sonofletor: n(r[7]) };
  if (clean(r[8])) l.obs = [l.obs, clean(r[8])].filter(Boolean).join(' / ');
});

// ---------- Postes ----------
grid('Postes').slice(1).forEach((r) => {
  if (!r[1]) return;
  const po = String(r[0] || '').replace(/\D/g, '');
  const l = melhor(clean(r[1]), locais, po);
  if (!l) return log.push(`Postes: sem par para "${clean(r[1])}"`);
  const dt = r.slice(6).find((v) => v instanceof Date && v.getFullYear() > 1950);
  const hr = r.slice(6).find((v) => v instanceof Date && v.getFullYear() < 1901);
  l.postes = { qtd: n(r[5]), dataEntrega: iso(dt), horaEntrega: hr ? hora(hr) : '', rota: clean(r[3]), sequencia: String(r[4] ?? '') };
});

// ---------- Levantamento Técnico ----------
const lev = grid('Levantamento Tecnico');
const poRow = lev[3];
const head = lev[4];
const colLocal = {};
for (let c = 3; c < head.length; c++) {
  const nome = clean(head[c]);
  if (!nome || /qtd|valor/i.test(nome)) continue;
  const l = melhor(nome, locais, poRow[c]);
  if (!l) { log.push(`Levantamento: sem par para "${nome}" (PO ${poRow[c]})`); continue; }
  colLocal[c] = l;
  log.push(`Levantamento: "${nome}" → "${l.nome}"`);
}
lev.slice(5).forEach((r) => {
  const desc = clean(r[1]);
  if (!desc) return;
  const codRaw = clean(r[0]);
  const codigo = /^\d+$/.test(codRaw) ? codRaw : '';
  const obs = codigo ? '' : codRaw;
  Object.entries(colLocal).forEach(([c, l]) => {
    const q = n(r[c]);
    if (q > 0) l.levantamento.push({ id: uid(), codigo, descricao: desc, un: clean(r[2]), qtd: q, obs });
  });
});

// ---------- Estoque recebido ----------
const estoque = [];
grid('Estoque Recebido').slice(3).forEach((r) => {
  if (!r[2] || !n(r[3])) return;
  const codQ = clean(r[4]);
  estoque.push({
    id: uid(),
    data: '',
    endereco: clean(r[0]),
    codigo: /^\d+$/.test(codQ) ? codQ : clean(r[1]),
    descricao: clean(r[2]),
    qtd: n(r[3]),
    obs: /^\d+$/.test(codQ) ? clean(r[5]) : [codQ, clean(r[5])].filter(Boolean).join(' / '),
    criadoEm: now,
  });
});

const backup = { versao: 1, geradoEm: now, origem: 'Projetos_Gerais_SP.xlsx', clientes: [cliente], orcamentos, locais, estoque };
fs.writeFileSync(output, JSON.stringify(backup, null, 1));
console.log(log.join('\n'));
console.log(`\nClientes 1 | Orçamentos ${orcamentos.length} (${orcamentos.map((o) => o.po + ':' + o.itens.length).join(', ')}) | Locais ${locais.length} | Estoque ${estoque.length}`);
const tot = orcamentos.reduce((s, o) => s + o.itens.reduce((a, i) => a + i.qtd * i.custoUnit, 0), 0);
console.log('Orçado total', tot.toFixed(2));
