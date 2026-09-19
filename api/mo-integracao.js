import { exigirUsuario, PODE_EDITAR } from './_lib/auth.js';
import { lerTudo, db } from './_lib/db.js';
import { alocDisponivel, lerAlocacao } from './_lib/aloc.js';
import { comprasPorPo } from './_lib/moTerceiros.js';

const categoriaCargo = (cargo) => (/AUXILIAR/i.test(cargo || '') ? 'auxiliar' : 'tecnico');

function valorHoraEquipe(tabelaMO, tecnicos, auxiliares) {
  const regra = (tabelaMO || []).find((r) => Number(r.tecnicos) === tecnicos && Number(r.auxiliares) === auxiliares);
  return regra ? Number(regra.valorHora) || 0 : null;
}

function* diasUteis(inicioISO, fimISO) {
  let d = new Date(inicioISO + 'T00:00:00Z');
  const fim = new Date(fimISO + 'T00:00:00Z');
  while (d <= fim) {
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function horasNoDia(a) {
  if (a.horaInicio && a.horaFim) {
    const [h1, m1] = a.horaInicio.split(':').map(Number);
    const [h2, m2] = a.horaFim.split(':').map(Number);
    let horas = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
    if (horas >= 6) horas -= 1;
    return Math.max(horas, 0);
  }
  return 8;
}

const extrairPo = (nomeProjeto) => {
  const m = String(nomeProjeto || '').match(/PO\s*0*([0-9]{3,})/i);
  return m ? m[1] : null;
};

export default async function handler(req, res) {
  try {
    const sincronizar = req.query.sincronizar === '1';
    const u = await exigirUsuario(req, res, sincronizar ? PODE_EDITAR : undefined);
    if (!u) return;

    if (!alocDisponivel()) {
      return res.status(503).json({ erro: 'Integração com a Central de Alocação não configurada (faltam ALOC_REDIS_URL / ALOC_REDIS_TOKEN).' });
    }

    const [{ tecnicos, projetos, allocations }, dados] = await Promise.all([lerAlocacao(), lerTudo()]);
    const tabelaMO = dados.tabelaMO || [];
    const tecnicoPorId = Object.fromEntries(tecnicos.map((t) => [t.id, t]));
    const hoje = new Date().toISOString().slice(0, 10);

    const poDoProjeto = {};
    for (const p of projetos) {
      const po = extrairPo(p.nome);
      if (po) poDoProjeto[p.id] = po;
    }

    // Agrupa quem esteve alocado em cada PO, em cada dia útil já ocorrido
    const porPoDia = new Map();
    const addPessoa = (po, dia, tec, horas, extra) => {
      const k = `${po}|${dia}|${extra ? 'x' : 'n'}`;
      if (!porPoDia.has(k)) porPoDia.set(k, { po, dia, extra, pessoas: [] });
      porPoDia.get(k).pessoas.push({ nome: tec.nome, cargo: tec.cargo, horas });
    };

    for (const a of allocations) {
      const po = poDoProjeto[a.projetoId];
      const tec = tecnicoPorId[a.tecnicoId];
      if (!po || !tec || !a.inicio) continue;
      const fimReal = a.fim && a.fim < hoje ? a.fim : hoje;
      if (a.inicio <= hoje && a.inicio <= fimReal) {
        for (const dia of diasUteis(a.inicio, fimReal)) addPessoa(po, dia, tec, horasNoDia(a), false);
      }
      for (const he of a.horasExtras || []) {
        if (he.data && he.data <= hoje) addPessoa(po, he.data, tec, Number(he.horas) || 0, true);
      }
    }

    const resultado = {};
    const garantePo = (po) => {
      if (!resultado[po]) resultado[po] = { 
        po, 
        horasNormais: 0, 
        horasExtras: 0, 
        hotel: 0,
        refeicao: 0,
        outros: 0,
        terceiros: 0,
        terceirosLinhas: 0,
        fretes: 0,
        fretesLinhas: 0,
        custo: 0, 
        moOrcado: 0, 
        composicoesSemRegra: [] 
      };
      return resultado[po];
    };

    for (const { po, pessoas, extra } of porPoDia.values()) {
      const r = garantePo(po);
      const tecnicosN = pessoas.filter((p) => categoriaCargo(p.cargo) === 'tecnico').length;
      const auxN = pessoas.filter((p) => categoriaCargo(p.cargo) === 'auxiliar').length;
      const horasDoDia = Math.max(...pessoas.map((p) => p.horas), 0);
      const valor = valorHoraEquipe(tabelaMO, tecnicosN, auxN);
      if (extra) r.horasExtras += horasDoDia;
      else r.horasNormais += horasDoDia;
      if (valor == null) r.composicoesSemRegra.push(`${tecnicosN} técnico(s) + ${auxN} auxiliar(es)`);
      else r.custo += horasDoDia * valor;
    }

    // Acumula hotel, refeição e outros por PO.
    // Na Central de Alocação as despesas ficam em a.despesas = [{tipo, data, valor}],
    // com tipo em 'Hotel' | 'Refeição' | 'Outro'. Os campos soltos (a.hotel, a.refeicao,
    // a.outros) são aceitos por compatibilidade com lançamentos antigos.
    const tipoDespesa = (t) => {
      const n = String(t || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      if (n.startsWith('HOTEL')) return 'hotel';
      if (n.startsWith('REFEIC')) return 'refeicao';
      return 'outros';
    };

    for (const a of allocations) {
      const po = poDoProjeto[a.projetoId];
      if (!po) continue;

      const r = garantePo(po);

      for (const d of a.despesas || []) {
        const v = Number(d.valor) || 0;
        if (!v) continue;
        r[tipoDespesa(d.tipo)] += v;
      }

      if (a.hotel) r.hotel += Number(a.hotel) || 0;
      if (a.refeicao) r.refeicao += Number(a.refeicao) || 0;
      if (a.outros) r.outros += Number(a.outros) || 0;
    }

    // Compras via SC/SAP (Rastreamento SC): serviços de terceiros entram no custo de M.O;
    // fretes são apurados à parte, só para consulta.
    // Ignora códigos que já existem como item de material do orçamento — esses já foram
    // baixados pela Importação SAP e contá-los aqui dobraria o valor.
    const codigosMateriais = {};
    for (const o of dados.orcamentos || []) {
      if (!o.po) continue;
      for (const i of o.itens || []) {
        const c = String(i.codigo || '').trim();
        if (!c || i.categoria === 'M.O') continue;
        (codigosMateriais[o.po] = codigosMateriais[o.po] || new Set()).add(c);
      }
    }
    const compras = comprasPorPo(dados.rastreamentoCompras || [], dados.moTerceiros || [], codigosMateriais);
    for (const [po, c] of Object.entries(compras)) {
      const r = garantePo(po);
      r.terceiros += c.terceiros.total;
      r.terceirosLinhas += c.terceiros.linhas.length;
      // Fretes são só informativos — não entram no custo de M.O.
      r.fretes += c.fretes.total;
      r.fretesLinhas += c.fretes.linhas.length;
    }

    // Atualiza custo total com hotel + refeição + outros + serviços de terceiros
    for (const po in resultado) {
      const r = resultado[po];
      r.custo += r.hotel + r.refeicao + r.outros + r.terceiros;
    }

    for (const o of dados.orcamentos || []) {
      if (!o.po) continue;
      const moOrcado = (o.itens || []).filter((i) => i.categoria === 'M.O').reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.custoUnit) || 0), 0);
      if (!moOrcado) continue;
      garantePo(o.po).moOrcado += moOrcado;
    }

    const porPo = Object.values(resultado)
      .map((r) => ({ ...r, composicoesSemRegra: [...new Set(r.composicoesSemRegra)], semLinhaMO: !r.moOrcado && r.custo > 0, pctConsumido: r.moOrcado ? Math.round((r.custo / r.moOrcado) * 100) : null }))
      .sort((a, b) => String(a.po).localeCompare(String(b.po), 'pt-BR', { numeric: true }));

    // Sincroniza: grava o custo calculado no(s) item(ns) de M.O de cada orçamento — se a PO
    // tiver mais de uma linha de M.O, divide proporcionalmente ao peso orçado de cada linha.
    // O custo inclui horas (normais + extras) + hotel + refeição + outros + serviços de terceiros (SC)
    let sincronizados = 0;
    if (sincronizar) {
      const custoPorPo = Object.fromEntries(porPo.map((r) => [String(r.po), r.custo]));
      const custoItem = (i) => (Number(i.qtd) || 0) * (Number(i.custoUnit) || 0);

      const pesoMOporPo = {};
      for (const o of dados.orcamentos || []) {
        if (!o.po || !(o.po in custoPorPo)) continue;
        for (const i of o.itens || []) {
          if (i.categoria !== 'M.O') continue;
          pesoMOporPo[o.po] = (pesoMOporPo[o.po] || 0) + custoItem(i);
        }
      }

      const lote = {};
      for (const o of dados.orcamentos || []) {
        if (!o.po || !(o.po in custoPorPo)) continue;
        const custoTotal = custoPorPo[o.po];
        const pesoTotal = pesoMOporPo[o.po] || 0;
        let mudou = false;
        const itens = (o.itens || []).map((i) => {
          if (i.categoria !== 'M.O') return i;
          const qtd = Number(i.qtd) || 1;
          const fatia = pesoTotal ? custoItem(i) / pesoTotal : 0;
          const valorUnitPago = (custoTotal * fatia) / qtd;
          if (Number(i.qtdComprada) === qtd && Math.abs((Number(i.valorUnitPago) || 0) - valorUnitPago) < 0.01) return i;
          mudou = true;
          return { ...i, qtdComprada: qtd, valorUnitPago, dataCompra: hoje };
        });
        if (mudou) {
          lote[o.id] = { ...o, itens, atualizadoEm: new Date().toISOString(), atualizadoPor: 'Integração M.O (alocação + SC)' };
          sincronizados++;
        }
      }
      if (Object.keys(lote).length) await db.hset('orcamentos', lote);
    }

    return res.json({ ok: true, atualizadoEm: new Date().toISOString(), sincronizados, porPo });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message || 'Erro interno na integração.' });
  }
}
