/**
 * Motor de cálculo: criticidade, estoque mínimo (ponto de pedido), estoque máximo,
 * reserva técnica e data limite para iniciar o processo de compra.
 *
 * Funções puras (sem SpreadsheetApp) para poderem ser testadas fora do Google.
 *
 * Classificação técnica das entradas:
 *  - VARIÁVEIS (números medidos, entram nas fórmulas): efetivo, taxa de consumo por
 *    policial/viatura/unidade, consumo histórico e seu desvio, saldo, em trânsito,
 *    tempo de compra (por fase) e sua variação, prazo de entrega da ata, parque instalado.
 *  - CRITÉRIOS (julgamento 1-5, ponderado por pesos): essencialidade para o policiamento,
 *    risco à segurança na falta, dificuldade de substituição, controle institucional,
 *    variabilidade da demanda, duração e incerteza da reposição. Os dois últimos são
 *    derivados automaticamente das variáveis de tempo de compra, quando medidas.
 *  - PARÂMETROS (política do P4): pesos, limites de classe, nível de serviço, margens.
 */

var DIAS_MES = 30.4;

/** Converte o tempo de compra (dias) em nota 1-5 do critério "duração da reposição". */
function notaPorPrazo(dias, faixas) {
  if (!(dias > 0)) return null;
  for (var i = 0; i < faixas.length; i++) if (dias <= faixas[i]) return i + 1;
  return 5;
}

/** Converte coeficiente de variação (desvio/média) em nota 1-5. */
function notaPorCV(cv) {
  if (cv === null || cv === undefined || isNaN(cv)) return null;
  if (cv < 0.1) return 1;
  if (cv < 0.25) return 2;
  if (cv < 0.5) return 3;
  if (cv < 1) return 4;
  return 5;
}

/**
 * Nota de criticidade 0-100 e classe (pulmão).
 * notas: {ESS, SEG, SUB, CTL, VAR, TR, TRV} 1-5; pesos: mesmo formato (0-10).
 */
function criticidade(notas, pesos, p) {
  var soma = 0, den = 0, chaves = Object.keys(pesos);
  for (var i = 0; i < chaves.length; i++) {
    var k = chaves[i], w = Number(pesos[k]) || 0, n = Number(notas[k]);
    if (!w || !(n >= 1)) continue;
    soma += w * n; den += w;
  }
  var nota = den ? soma / den * 20 : 0;
  var classe = nota >= p.limOperacional ? 'Operacional' : nota >= p.limFuncional ? 'Funcional' : 'Administrativo';
  // Essencialidade máxima (item vital ao policiamento) nunca fica abaixo de Operacional.
  if (p.pisoEssencial && Number(notas.ESS) === 5) classe = 'Operacional';
  return { nota: nota, classe: classe };
}

/**
 * Demanda mensal do item.
 * base: POLICIAL | VIATURA | UNIDADE | HISTORICO
 * Retorna a demanda adotada e, quando há as duas fontes, a divergência entre
 * a demanda por direcionador (efetivo × taxa) e a histórica.
 */
function demandaMensal(item, efetivo) {
  var direcionador = { POLICIAL: efetivo.policiais, VIATURA: efetivo.viaturas, UNIDADE: efetivo.unidades }[item.base];
  var porTaxa = direcionador !== undefined && item.taxa > 0 ? direcionador * item.taxa : null;
  var hist = item.consumoHistorico > 0 ? item.consumoHistorico : null;
  var adotada, fonte;
  if (item.base !== 'HISTORICO' && porTaxa !== null) { adotada = porTaxa; fonte = item.base.toLowerCase() + ' × taxa'; }
  else { adotada = hist; fonte = hist === null ? 'sem dado' : 'histórico'; }
  var divergencia = porTaxa && hist ? (hist - porTaxa) / porTaxa : null;
  return { demanda: adotada, fonte: fonte, porTaxa: porTaxa, historico: hist, divergencia: divergencia };
}

/**
 * Tempo total de reposição (dias): da demanda à entrega na ponta.
 * item.fases = {interna, licitacao, contratacao, entrega, distribuicao}; item.fasesReais indica
 * quais foram digitadas pelo usuário (as demais são o padrão do sistema).
 * Prioridade: ata vigente > fases reais do item > histórico de processos > padrão do sistema.
 */
function tempoReposicao(item, familia, historico) {
  var f = item.fases || {}, reais = item.fasesReais || {};
  var distrib = Number(f.distribuicao) || 0;
  var compra = ['interna', 'licitacao', 'contratacao', 'entrega'];
  var algumaReal = compra.some(function (k) { return reais[k]; });
  if (item.ataVigente && item.prazoAta > 0) {
    return { dias: item.prazoAta + distrib, desvio: 0, origem: 'ata de registro de preços' };
  }
  if (algumaReal) {
    return { dias: compra.reduce(function (s, k) { return s + (Number(f[k]) || 0); }, 0) + distrib, desvio: 0, origem: 'fases informadas no item' };
  }
  if (historico && historico.n > 0) return { dias: historico.media + distrib, desvio: historico.desvio, origem: 'histórico de ' + historico.n + ' processo(s)' };
  var padrao = compra.reduce(function (s, k) { return s + (Number(f[k]) || 0); }, 0) || Number(familia.leadTimeDias) || 0;
  return { dias: padrao + distrib, desvio: 0, origem: 'padrão do sistema' };
}

/** Divide o tempo de compra padrão da família entre as fases. */
function fasesPadrao(leadTimeDias, divisao, distribuicao) {
  var lt = Number(leadTimeDias) || 0;
  return { interna: Math.round(lt * divisao.interna), licitacao: Math.round(lt * divisao.licitacao),
    contratacao: Math.round(lt * divisao.contratacao), entrega: Math.round(lt * divisao.entrega), distribuicao: distribuicao };
}

/**
 * Estoque de segurança, ponto de pedido (estoque mínimo/gatilho) e máximo para consumo.
 * Com desvio da demanda conhecido usa o modelo estatístico
 *   SS = z × √(LT·σd² + d²·σLT²)   (LT e σLT em meses)
 * senão usa margem em meses de consumo por classe (fator de pulmão, doc. item 10).
 */
function niveisConsumo(d, lt, classe, item, notaVar, p) {
  var cfg = p.classes[classe];
  var ltM = lt.dias / DIAS_MES, sLtM = (lt.desvio || 0) / DIAS_MES;
  var ss, metodo;
  if (item.desvioHistorico > 0) {
    ss = cfg.z * Math.sqrt(ltM * Math.pow(item.desvioHistorico, 2) + Math.pow(d * sLtM, 2));
    metodo = 'estatístico (z=' + cfg.z + ')';
  } else {
    var reforco = notaVar >= 4 ? p.reforcoVariabilidade : 0;
    ss = d * cfg.margemMeses * (1 + reforco) + (sLtM ? d * sLtM : 0);
    metodo = 'fator de pulmão (' + cfg.margemMeses + ' mês' + (reforco ? ' +' + Math.round(reforco * 100) + '%' : '') + ')';
  }
  var minimo = Math.ceil(d * ltM + ss);
  var maximo = Math.ceil(minimo + d * cfg.horizonteMeses);
  return { seguranca: Math.ceil(ss), minimo: minimo, maximo: maximo, metodo: metodo };
}

/** Situação e data limite para iniciar o processo de compra. */
function situacao(posicao, d, niveis, hoje) {
  if (!(d > 0)) return { status: 'Sem demanda informada', dataLimite: null, cobertura: null, sugerido: 0 };
  var cobertura = posicao / d;
  var status = posicao <= niveis.minimo ? 'INICIAR COMPRA' : posicao > niveis.maximo ? 'EXCESSO' : 'Dentro da faixa';
  var dataLimite = null;
  if (posicao > niveis.minimo) {
    dataLimite = new Date(hoje.getTime());
    dataLimite.setDate(dataLimite.getDate() + Math.floor((posicao - niveis.minimo) / d * DIAS_MES));
  }
  return { status: status, dataLimite: dataLimite, cobertura: cobertura, sugerido: Math.max(0, niveis.maximo - posicao) };
}

/** Reserva técnica de bens permanentes (doc. item 11). */
function reservaTecnica(item, lt, classe, p) {
  var cfg = p.classes[classe];
  var taxa = Number(item.taxaIndisponibilidade) || 0;
  var rt = Math.round((Number(item.parque) || 0) * taxa * (lt.dias / 365) * cfg.fatorReserva);
  var est = Number(item.saldo) || 0;
  var status = rt === 0 ? 'Sem reserva exigida' : est < rt ? 'RESERVA INSUFICIENTE' : est > 2 * rt ? 'EXCESSO' : 'Dentro da faixa';
  return { reserva: rt, status: status, sugerido: Math.max(0, rt - est) };
}

/** Média e desvio do tempo total (dias) dos processos de compra, por chave (item ou família). */
function estatisticaProcessos(processos) {
  var g = {};
  processos.forEach(function (pr) {
    if (!(pr.dias > 0)) return;
    [pr.item, pr.familia].forEach(function (k) { if (k) (g[k] = g[k] || []).push(pr.dias); });
  });
  var out = {};
  Object.keys(g).forEach(function (k) {
    var v = g[k], m = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    var s = v.length > 1 ? Math.sqrt(v.reduce(function (a, b) { return a + Math.pow(b - m, 2); }, 0) / (v.length - 1)) : 0;
    out[k] = { n: v.length, media: m, desvio: s };
  });
  return out;
}

/**
 * Calcula um item completo e devolve resultado + justificativa rastreável.
 */
function calcularItem(item, familia, efetivo, estatProc, p, hoje) {
  var hist = estatProc[item.codigo] || estatProc[item.familia];
  var lt = tempoReposicao(item, familia, hist);
  var notas = {
    ESS: familia.ESS, SEG: familia.SEG, SUB: familia.SUB, CTL: familia.CTL,
    VAR: notaPorCV(item.consumoHistorico > 0 && item.desvioHistorico >= 0 ? item.desvioHistorico / item.consumoHistorico : null) || familia.VAR,
    TR: notaPorPrazo(lt.dias, p.faixasPrazo) || familia.TR,
    TRV: notaPorCV(lt.dias > 0 && lt.desvio > 0 ? lt.desvio / lt.dias : null) || familia.TRV
  };
  var crit = criticidade(notas, p.pesos, p);
  var r = { codigo: item.codigo, descricao: item.descricao, familia: item.familia, tipo: familia.tipo, nota: crit.nota, classe: crit.classe, leadTime: lt.dias, origemLeadTime: lt.origem, notas: notas };
  if (familia.tipo === 'PERMANENTE') {
    var res = reservaTecnica(item, lt, crit.classe, p);
    r.minimo = res.reserva; r.maximo = null; r.status = res.status; r.sugerido = res.sugerido; r.dataLimite = null;
    r.demanda = null; r.justificativa = 'Reserva técnica = parque ' + item.parque + ' × indisp. ' + Math.round(item.taxaIndisponibilidade * 100) + '%/ano × ' + Math.round(lt.dias) + ' dias (' + lt.origem + ') × fator ' + p.classes[crit.classe].fatorReserva + ' [' + crit.classe + ']';
    return r;
  }
  var dm = demandaMensal(item, efetivo);
  r.demanda = dm.demanda; r.fonteDemanda = dm.fonte; r.divergencia = dm.divergencia;
  if (!(dm.demanda > 0)) {
    var porBase = { POLICIAL: 'por policial (e o efetivo em Unidades)', VIATURA: 'por viatura', UNIDADE: 'por fração' }[item.base];
    r.status = 'Sem demanda informada';
    r.justificativa = 'Falta o consumo: informe ' + (porBase ? 'a taxa ' + porBase + ' ou ' : '') + 'o consumo histórico mensal na aba Itens.';
    return r;
  }
  var nv = niveisConsumo(dm.demanda, lt, crit.classe, item, notas.VAR, p);
  var posicao = (Number(item.saldo) || 0) + (Number(item.emTransito) || 0);
  var st = situacao(posicao, dm.demanda, nv, hoje);
  r.seguranca = nv.seguranca; r.minimo = nv.minimo; r.maximo = nv.maximo; r.posicao = posicao;
  r.cobertura = st.cobertura; r.status = st.status; r.dataLimite = st.dataLimite; r.sugerido = st.sugerido;
  r.justificativa = 'Demanda ' + Math.round(dm.demanda) + '/mês (' + dm.fonte + '); reposição ' + Math.round(lt.dias) + ' dias (' + lt.origem + '); segurança por ' + nv.metodo + ' [' + crit.classe + ', nota ' + Math.round(crit.nota) + ']' +
    (dm.divergencia !== null && Math.abs(dm.divergencia) > p.toleranciaDivergencia ? '; ATENÇÃO: histórico ' + (dm.divergencia > 0 ? 'acima' : 'abaixo') + ' do esperado pelo efetivo em ' + Math.round(Math.abs(dm.divergencia) * 100) + '%' : '');
  return r;
}

if (typeof module !== 'undefined') {
  module.exports = { notaPorPrazo: notaPorPrazo, notaPorCV: notaPorCV, criticidade: criticidade, demandaMensal: demandaMensal, tempoReposicao: tempoReposicao, fasesPadrao: fasesPadrao, niveisConsumo: niveisConsumo, situacao: situacao, reservaTecnica: reservaTecnica, estatisticaProcessos: estatisticaProcessos, calcularItem: calcularItem };
}
