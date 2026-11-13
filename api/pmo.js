// Integração PMO Gitel: recebe o retrato enviado pelo botão de favoritos (bookmarklet)
// rodando dentro do pmo.gitel.com.br e devolve o último retrato salvo.
import { db } from './_lib/db.js';
import { exigirUsuario, corpo, PODE_EDITAR } from './_lib/auth.js';

const num = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));
export const poDoCodigo = (c) => {
  const m = String(c || '').match(/\d{3,}/);
  return m ? m[0].replace(/^0+/, '') : null;
};

function reduzProjeto(p, port) {
  return {
    codigo: p.codigo,
    po: poDoCodigo(p.codigo),
    nome: p.nome,
    cliente: p.cliente,
    comercial: p.comercial || null,
    status: p.status,
    fase: p.fase_ciclo,
    modelo: p.modelo_receita,
    bu: port?.bu_nome || p.bu_id || null,
    dataCriacao: p.data_criacao || null,
    dataValidade: p.data_validade || null,
    criadoEm: p.created_at || null,
    robOrcada: num(p.rob_orcada ?? port?.rob_orcada),
    custoOrcado: num(p.custo_orcado),
    lucroOrcado: num(p.lucro_orcado),
    mclOrcada: num(p.mcl_orcada ?? port?.mcl_orcada),
    robReal: num(port?.rob_real),
    robProjetada: num(port?.rob_projetada),
    robTotal: num(port?.rob_total),
    cmvReal: num(port?.cmv_real),
    mclReal: num(port?.mcl_real),
  };
}

const reduzItem = (i) => ({
  cod: i.cod_item,
  descricao: i.descricao,
  um: i.um || null,
  qtdOrcada: num(i.qtd_orcada),
  qtdComprada: num(i.qtd_comprada),
  qtdEntrada: num(i.qtd_entrada),
  qtdSaida: num(i.qtd_saida),
  estoque: num(i.saldo_em_estoque),
  status: i.status || null,
  alertas: i.alertas || [],
});

function reduzDetalhe(d = {}) {
  const eq = d.equipamentos || {};
  const fc = d.forecast || {};
  const rc = d.receber || {};
  return {
    itens: (eq.itens || []).map(reduzItem),
    servicos: (eq.servicos_e_licencas || []).map(reduzItem),
    foraBom: (eq.itens_fora_bom || []).length,
    receber: d.receber
      ? {
          contratado: num(rc.total_contratado),
          faturado: num(rc.total_faturado),
          aFaturar: num(rc.total_a_faturar),
          recebido: num(rc.total_recebido),
          emAberto: num(rc.total_em_aberto),
          atrasado: num(rc.total_atrasado),
        }
      : null,
    forecast: d.forecast ? { progresso: num(fc.progresso), risco: fc.risco || null, atual: fc.atual || null, cenarios: fc.cenarios || null } : null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const u = await exigirUsuario(req, res);
      if (!u) return;
      const [snapshot, vistos] = await Promise.all([db.hget('pmo', 'snapshot'), db.hget('pmo', 'vistos')]);
      return res.json({ snapshot: snapshot || null, vistos: vistos || {} });
    }

    if (req.method === 'POST') {
      const u = await exigirUsuario(req, res, PODE_EDITAR);
      if (!u) return;
      const { projetos, portfolio = [], detalhes = {} } = corpo(req);
      if (!Array.isArray(projetos) || !projetos.length) return res.status(400).json({ erro: 'Nenhum projeto recebido do PMO.' });

      const portPorCodigo = Object.fromEntries((Array.isArray(portfolio) ? portfolio : []).map((p) => [p.codigo, p]));
      const lista = projetos.filter((p) => p && p.codigo).map((p) => reduzProjeto(p, portPorCodigo[p.codigo]));
      const det = {};
      for (const [cod, d] of Object.entries(detalhes || {})) det[cod] = reduzDetalhe(d);

      const agora = new Date().toISOString();
      const vistosAntes = (await db.hget('pmo', 'vistos')) || {};
      const primeiraVez = !Object.keys(vistosAntes).length;
      const vistos = { ...vistosAntes };
      const novos = [];
      for (const p of lista) {
        if (!vistos[p.codigo]) {
          vistos[p.codigo] = agora;
          if (!primeiraVez) novos.push(p.codigo);
        }
      }

      const snapshot = { recebidoEm: agora, enviadoPor: u.nome, total: lista.length, projetos: lista, detalhes: det };
      const tamanho = JSON.stringify(snapshot).length + JSON.stringify(vistos).length;
      if (tamanho > 950_000) return res.status(413).json({ erro: `Retrato do PMO grande demais (${Math.round(tamanho / 1024)} KB).` });

      await db.hset('pmo', { snapshot, vistos });
      return res.json({ ok: true, total: lista.length, comDetalhe: Object.keys(det).length, novos });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message || 'Erro interno' });
  }
}
