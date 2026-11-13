// Código do botão de favoritos que roda dentro do pmo.gitel.com.br.
// O CSP do PMO bloqueia fetch para outros domínios, então os dados vão por
// postMessage para uma janela do Controle de Obras (#/pmo/receber), que salva.
function rodarNoPmo(APP) {
  if (location.hostname !== 'pmo.gitel.com.br') return alert('Abra o PMO (pmo.gitel.com.br) já logado e clique de novo neste favorito.');
  const w = window.open(APP + '/#/pmo/receber', 'pmo_sync', 'width=560,height=460');
  if (!w) return alert('O navegador bloqueou a janela. Libere pop-ups para pmo.gitel.com.br e tente de novo.');

  let tk = null;
  for (const s of [localStorage, sessionStorage]) {
    for (let i = 0; i < s.length; i++) {
      for (const t of (s.getItem(s.key(i)) || '').match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || []) {
        try {
          const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (p.aud === 'gitel-pmo' && (!p.exp || p.exp * 1000 > Date.now())) tk = t;
        } catch (e) {}
      }
    }
  }
  const h = tk ? { Authorization: 'Bearer ' + tk } : {};
  const g = async (u) => {
    const r = await fetch('/api/' + u, { headers: h, credentials: 'include' });
    if (r.status === 401) throw new Error('Sessão do PMO expirada. Recarregue o PMO, faça login e tente de novo.');
    if (!r.ok) throw new Error(u + ': HTTP ' + r.status);
    return r.json();
  };
  const msg = (o) => w.postMessage(o, APP);
  let feito = false;

  window.addEventListener('message', async (ev) => {
    if (ev.origin !== APP || !ev.data || ev.data.tipo !== 'pmo-pronto' || feito) return;
    feito = true;
    try {
      msg({ tipo: 'pmo-status', texto: 'Lendo lista de projetos do PMO…' });
      const [lista, portfolio] = await Promise.all([g('projetos'), g('dashboard/portfolio').catch(() => [])]);
      const projetos = lista.items || lista;
      const pos = ev.data.pos || [];
      const alvo = projetos.filter((p) => {
        const m = String(p.codigo).match(/\d{3,}/);
        return m && pos.includes(m[0].replace(/^0+/, ''));
      });
      const detalhes = {};
      let k = 0;
      for (const p of alvo) {
        msg({ tipo: 'pmo-status', texto: 'Detalhes ' + ++k + '/' + alvo.length + ': ' + p.codigo });
        const c = encodeURIComponent(p.codigo);
        const [equipamentos, receber, forecast] = await Promise.all(
          ['de-para-equipamento', 'receber', 'forecast'].map((x) => g('projetos/' + c + '/' + x).catch(() => null)),
        );
        detalhes[p.codigo] = { equipamentos, receber, forecast };
      }
      msg({ tipo: 'pmo-dados', projetos, portfolio, detalhes });
    } catch (e) {
      msg({ tipo: 'pmo-erro', texto: e.message });
    }
  });
}

export const bookmarkletPmo = (origem) => 'javascript:' + encodeURIComponent(`(${rodarNoPmo.toString()})(${JSON.stringify(origem)});void 0`);
