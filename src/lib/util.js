import * as XLSX from 'xlsx';

// ---------- formatação ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export const moeda = (v) => brl.format(v || 0);
export const moeda0 = (v) => brl0.format(v || 0);
export const numero = (v) => nf.format(v || 0);
export const pct = (v) => `${nf.format((v || 0) * 100)}%`;
export const data = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const hojeISO = () => new Date().toISOString().slice(0, 10);

// Converte um endereço em texto para coordenadas (lat/lng), usando o geocodificador
// gratuito do OpenStreetMap. Retorna null se não achar ou der erro de rede.
export async function geocodificarEndereco(endereco) {
  if (!endereco || !endereco.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!arr.length) return null;
    const lat = Number(arr[0].lat);
    const lng = Number(arr[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const parseNum = (s) => {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim();
  if (!t) return 0;
  // aceita 1.234,56 ou 1234.56
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = parseFloat(limpo.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ---------- status ----------
export const STATUS_LOCAL = ['Não iniciada', 'Em andamento', 'Pausada', 'Concluída'];
export const COR_STATUS = {
  'Não iniciada': 'var(--cinza-status)',
  'Em andamento': 'var(--amarelo)',
  Pausada: 'var(--vermelho)',
  Concluída: 'var(--verde)',
};
export const STATUS_ORC = ['Em análise', 'Aprovado', 'Em execução', 'Encerrado', 'Perdido'];

// ---------- cálculos ----------
export const custoItem = (i) => (Number(i.qtd) || 0) * (Number(i.custoUnit) || 0);
export const pagoItem = (i) => (Number(i.qtdComprada) || 0) * (Number(i.valorUnitPago) || 0);

export function totaisOrc(o) {
  const t = { orcado: 0, pago: 0, rob: 0, cat: {} };
  for (const i of o.itens || []) {
    const c = custoItem(i);
    const p = pagoItem(i);
    t.orcado += c;
    t.pago += p;
    t.rob += Number(i.rob) || 0;
    const k = i.categoria || 'Eletrônico';
    t.cat[k] = t.cat[k] || { orcado: 0, pago: 0 };
    t.cat[k].orcado += c;
    t.cat[k].pago += p;
  }
  if (!t.rob && o.robArquivo) t.rob = o.robArquivo;
  return t;
}

// Agrupa por cliente + PO
export function agruparPOs(dados) {
  const mapa = new Map();
  const chave = (cid, po) => `${cid}|${po || 'sem PO'}`;
  for (const o of dados.orcamentos) {
    const k = chave(o.clienteId, o.po);
    if (!mapa.has(k)) mapa.set(k, { po: o.po || 'sem PO', clienteId: o.clienteId, orcamentos: [], locais: [], orcado: 0, pago: 0, rob: 0 });
    const g = mapa.get(k);
    const t = totaisOrc(o);
    g.orcamentos.push(o);
    g.orcado += t.orcado;
    g.pago += t.pago;
    g.rob += t.rob;
  }
  for (const l of dados.locais) {
    const k = chave(l.clienteId, l.po);
    if (!mapa.has(k)) mapa.set(k, { po: l.po || 'sem PO', clienteId: l.clienteId, orcamentos: [], locais: [], orcado: 0, pago: 0, rob: 0 });
    const g = mapa.get(k);
    g.locais.push(l);
    g.orcado += Number(l.valorTerceiro) || 0;
    g.pago += Number(l.valorTerceiroPago) || 0;
  }
  return [...mapa.values()].sort((a, b) => String(a.po).localeCompare(String(b.po), 'pt-BR', { numeric: true }));
}

export function filtrarPorCliente(dados, clienteId) {
  if (!clienteId) return dados;
  return {
    ...dados,
    orcamentos: dados.orcamentos.filter((o) => o.clienteId === clienteId),
    locais: dados.locais.filter((l) => l.clienteId === clienteId),
  };
}

// Gasto semanal a partir das datas de compra
export function serieSemanal(orcamentos) {
  const compras = [];
  for (const o of orcamentos) for (const i of o.itens || []) if (i.dataCompra && pagoItem(i)) compras.push([i.dataCompra, pagoItem(i)]);
  if (!compras.length) return [];
  const segunda = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const porSemana = {};
  compras.forEach(([d, v]) => (porSemana[segunda(d)] = (porSemana[segunda(d)] || 0) + v));
  const semanas = Object.keys(porSemana).sort();
  const out = [];
  let d = new Date(semanas[0] + 'T12:00:00');
  const fim = new Date(Math.max(new Date(semanas.at(-1) + 'T12:00:00'), new Date()));
  let acum = 0;
  while (d <= fim && out.length < 160) {
    const k = d.toISOString().slice(0, 10);
    acum += porSemana[k] || 0;
    out.push({ semana: k, gasto: porSemana[k] || 0, acumulado: acum });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// Orçado (itens das OPs) x levantado (locais) por código
export function validacaoPO(orcamentos, locais) {
  const m = new Map();
  const add = (cod, desc, un, obs = '') => {
    const k = cod || `sem:${semAcento(desc)}`;
    if (!m.has(k)) m.set(k, { codigo: cod, descricao: desc, un, orcado: 0, levantado: 0, obs });
    const r = m.get(k);
    if (!r.un && un) r.un = un;
    if (!r.obs && obs) r.obs = obs;
    return r;
  };
  for (const o of orcamentos) for (const i of o.itens || []) if (i.codigo && i.categoria === 'Eletrônico') add(i.codigo, i.descricao, i.unidade).orcado += Number(i.qtd) || 0;
  for (const l of locais) for (const x of l.levantamento || []) add(x.codigo, x.descricao, x.un, x.obs).levantado += Number(x.qtd) || 0;
  return [...m.values()]
    .filter((r) => r.levantado > 0 || r.orcado > 0)
    .map((r) => {
      const dif = r.orcado - r.levantado;
      let sit = 'OK';
      if (!r.codigo) sit = /terceiro/i.test(r.obs) ? 'Absorvido terceiro' : 'Sem código';
      else if (r.levantado && !r.orcado) sit = 'Sem código na OP';
      else if (dif < 0) sit = 'Falta na OP';
      else if (dif > 0) sit = r.levantado ? 'Sobra na OP' : 'Não levantado';
      return { ...r, dif, sit };
    })
    .sort((a, b) => (a.codigo ? 0 : 1) - (b.codigo ? 0 : 1) || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
}

// Consolidado por código: soma quantidade e custo por PO, para os orçamentos escolhidos
export function consolidarOrcamentos(orcamentos) {
  const m = new Map();
  for (const o of orcamentos)
    for (const i of o.itens || []) {
      const k = i.codigo || `sem:${semAcento(i.descricao)}`;
      if (!m.has(k)) m.set(k, { codigo: i.codigo, descricao: i.descricao, grupo: i.grupo, categoria: i.categoria, un: i.unidade, porPO: {}, qtd: 0, custo: 0 });
      const r = m.get(k);
      r.porPO[o.po] = (r.porPO[o.po] || 0) + (Number(i.qtd) || 0);
      r.qtd += Number(i.qtd) || 0;
      r.custo += custoItem(i);
    }
  return [...m.values()].sort((a, b) => String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'));
}

// Painel de pendências: tudo que precisa de atenção agora
export function pendencias(dados) {
  const hoje = hojeISO();
  const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const locaisParados = dados.locais.filter((l) => l.status === 'Não iniciada' || l.status === 'Pausada');

  const orcamentosVencendo = dados.orcamentos
    .filter((o) => o.vencimento && o.vencimento <= em30dias && !['Encerrado', 'Perdido'].includes(o.status))
    .map((o) => ({ ...o, vencido: o.vencimento < hoje }))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const terceirosPendentes = dados.locais
    .map((l) => ({ ...l, saldoTerceiro: (Number(l.valorTerceiro) || 0) - (Number(l.valorTerceiroPago) || 0) }))
    .filter((l) => l.saldoTerceiro > 0.01)
    .sort((a, b) => b.saldoTerceiro - a.saldoTerceiro);

  return { locaisParados, orcamentosVencendo, terceirosPendentes };
}

export const categoriaCargo = (cargo) => (/AUXILIAR/i.test(cargo || '') ? 'auxiliar' : 'tecnico');

// Acha o valor/hora cadastrado para uma composição de equipe (nº técnicos + nº auxiliares).
// Retorna null quando não existe regra cadastrada para essa composição.
export function valorHoraEquipe(tabelaMO, tecnicos, auxiliares) {
  const regra = (tabelaMO || []).find((r) => Number(r.tecnicos) === tecnicos && Number(r.auxiliares) === auxiliares);
  return regra ? Number(regra.valorHora) || 0 : null;
}

// ---------- API ----------
export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`/api/${caminho}`, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let json = {};
  try {
    json = await r.json();
  } catch {
    /* sem corpo */
  }
  if (!r.ok) {
    const e = new Error(json.erro || `Erro ${r.status}`);
    e.status = r.status;
    e.dados = json;
    throw e;
  }
  return json;
}

// ---------- exportação ----------
export function exportarExcel(nomeArquivo, abas) {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ '': 'Sem dados' }]);
    const cols = Object.keys(linhas[0] || {});
    ws['!cols'] = cols.map((c) => ({ wch: Math.min(Math.max(c.length, ...linhas.slice(0, 200).map((l) => String(l[c] ?? '').length)) + 2, 60) }));
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
  }
  XLSX.writeFile(wb, nomeArquivo);
}

export function baixarJSON(nomeArquivo, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
