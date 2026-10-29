/**
 * Template de diagnóstico de criticidade e estoque mínimo (Google Planilhas + Apps Script).
 * Menu "Estoque mínimo" na planilha; painel web publicado por doGet().
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Estoque mínimo')
    .addItem('1. Configurar planilha (cria as abas)', 'configurar')
    .addItem('2. Configurar acesso ao CPELOG', 'configurarAcesso')
    .addItem('3. Importar do CPELOG', 'importarCpelog')
    .addItem('4. Recalcular', 'recalcular')
    .addSeparator()
    .addItem('Abrir painel', 'abrirPainel')
    .addToUi();
}

/**
 * Planilha onde ficam os dados. Se o projeto não estiver ligado a uma planilha
 * (Apps Script avulso, publicado como app da web), cria uma no Drive na primeira vez.
 */
function planilha_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('PLANILHA_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.getActive();
  if (!ss) ss = SpreadsheetApp.create('Estoque mínimo - CPELOG (dados do painel)');
  if (ss.getId() !== id) props.setProperty('PLANILHA_ID', ss.getId());
  if (!ss.getSheetByName('RESULTADOS')) configurarAbas_(ss);
  return ss;
}

/** Mensagem rápida na planilha, quando houver uma aberta (no app da web não há). */
function aviso_(msg, titulo) {
  try { var a = SpreadsheetApp.getActive(); if (a) a.toast(msg, titulo || 'Estoque mínimo', 6); } catch (e) { /* sem interface */ }
}

function configurar() { configurarAbas_(planilha_()); aviso_('Abas criadas. Configure o acesso e importe do CPELOG.'); }

/** Cria as abas que faltarem, com cabeçalho, parâmetros, famílias e exemplos. Não apaga nada. */
function configurarAbas_(ss) {
  var seeds = { PARAMETROS: PARAMETROS_PADRAO, FAMILIAS: FAMILIAS_PADRAO, UNIDADES: UNIDADES_EXEMPLO, ITENS: ITENS_EXEMPLO, PROCESSOS: PROCESSOS_EXEMPLO };
  Object.keys(ABAS).forEach(function (nome) {
    if (ss.getSheetByName(nome)) return;
    var sh = ss.insertSheet(nome), cab = ABAS[nome];
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
    sh.setFrozenRows(1);
    var dados = seeds[nome];
    if (dados && dados.length) {
      var w = Math.max.apply(null, dados.map(function (r) { return r.length; }));
      var linhas = dados.map(function (r) { var x = r.slice(); while (x.length < w) x.push(''); return x; });
      sh.getRange(2, 1, linhas.length, w).setValues(linhas);
    }
    if (nome === 'ITENS' || nome === 'UNIDADES' || nome === 'FAMILIAS' || nome === 'PARAMETROS') {
      var entrada = nome === 'FAMILIAS' ? [5, 14] : nome === 'PARAMETROS' ? [2, 2] : [1, cab.length];
      sh.getRange(2, entrada[0], Math.max(sh.getMaxRows() - 1, 1), entrada[1] - entrada[0] + 1).setBackground('#fff2cc');
    }
  });
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(padrao);
  preencherPadroes_(ss);
}

function linhas_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; });
}

function num_(v) { var n = Number(v); return v === '' || v === null || isNaN(n) ? null : n; }
function sim_(v) { return String(v).trim().toUpperCase().charAt(0) === 'S'; }
function dias_(a, b) { return a instanceof Date && b instanceof Date ? Math.round((b - a) / 86400000) : null; }

/** Lê tudo, calcula e grava RESULTADOS, as notas das famílias e os prazos dos processos. */
function recalcular() {
  var ss = planilha_();
  var p = lerParametros_(linhas_(ss, 'PARAMETROS'));

  var familias = {};
  linhas_(ss, 'FAMILIAS').forEach(function (r) {
    familias[String(r[0]).trim()] = { id: r[0], nome: r[1], tipo: String(r[2]).trim().toUpperCase(), ESS: r[4], SEG: r[5], SUB: r[6], CTL: r[7], VAR: r[8], TR: r[9], TRV: r[10], leadTimeDias: num_(r[11]), base: String(r[12]).trim().toUpperCase(), taxaIndisponibilidade: num_(r[13]) };
  });

  var ef = { policiais: 0, viaturas: 0, unidades: 0 };
  linhas_(ss, 'UNIDADES').forEach(function (r) {
    if (r[5] !== '' && !sim_(r[5])) return;
    ef.policiais += num_(r[2]) || 0; ef.viaturas += num_(r[3]) || 0; ef.unidades += num_(r[4]) || 0;
  });

  // Processos: calcula a duração de cada fase e o total (demanda -> entrega).
  var shProc = ss.getSheetByName('PROCESSOS'), procs = [];
  var lp = linhas_(ss, 'PROCESSOS');
  if (lp.length) {
    var fases = lp.map(function (r) {
      var d = [r[3], r[4], r[5], r[6], r[7]].map(function (x) { return x instanceof Date ? x : (x ? new Date(x) : null); });
      var tot = dias_(d[0], d[4]);
      procs.push({ item: String(r[1]).trim(), familia: String(r[2]).trim(), dias: tot });
      return [dias_(d[0], d[1]), dias_(d[1], d[2]), dias_(d[2], d[3]), dias_(d[3], d[4]), tot].map(function (x) { return x === null ? '' : x; });
    });
    shProc.getRange(2, 9, fases.length, 5).setValues(fases);
  }
  var estat = estatisticaProcessos(procs);

  preencherPadroes_(ss);
  var shI = ss.getSheetByName('ITENS');
  var li = shI.getLastRow() > 1 ? shI.getRange(2, 1, shI.getLastRow() - 1, ABAS.ITENS.length).getValues() : [];
  var cores = li.length ? shI.getRange(2, 1, li.length, ABAS.ITENS.length).getFontColors() : [];
  var hoje = new Date(), saida = [];
  li.forEach(function (r, idx) {
    if (String(r[COL.CODIGO]).trim() === '') return;
    var fam = familias[String(r[COL.FAMILIA]).trim()];
    if (!fam) { saida.push([r[0], r[1], r[COL.FAMILIA], '', '', '', '', '', '', '', '', '', '', '', '', 'FAMÍLIA INEXISTENTE', '', '', 'Corrigir a família na aba ITENS']); return; }
    var real = function (c) { return r[c] !== '' && !ehPadrao_(cores[idx][c]); };
    var item = {
      codigo: String(r[COL.CODIGO]).trim(), descricao: r[COL.DESCRICAO], familia: fam.id,
      base: String(r[COL.BASE]).trim().toUpperCase() || fam.base || 'HISTORICO',
      taxa: num_(r[COL.TAXA]), consumoHistorico: num_(r[COL.HIST]), desvioHistorico: num_(r[COL.DESVIO]),
      saldo: num_(r[COL.SALDO]) || 0, emTransito: num_(r[COL.TRANSITO]) || 0,
      ataVigente: sim_(r[COL.ATA]), prazoAta: num_(r[COL.PRAZO_ATA]),
      fases: { interna: num_(r[COL.FASE_INTERNA]), licitacao: num_(r[COL.LICITACAO]), contratacao: num_(r[COL.CONTRATACAO]), entrega: num_(r[COL.ENTREGA]), distribuicao: num_(r[COL.DISTRIBUICAO]) },
      fasesReais: { interna: real(COL.FASE_INTERNA), licitacao: real(COL.LICITACAO), contratacao: real(COL.CONTRATACAO), entrega: real(COL.ENTREGA) },
      parque: num_(r[COL.PARQUE]) || 0, taxaIndisponibilidade: num_(r[COL.INDISP]) !== null ? num_(r[COL.INDISP]) : (fam.taxaIndisponibilidade || 0)
    };
    var x = calcularItem(item, fam, ef, estat, p, hoje);
    saida.push([x.codigo, x.descricao, x.familia, x.tipo, x.classe, Math.round(x.nota), arred_(x.demanda, 1), x.fonteDemanda || '',
      Math.round(x.leadTime), x.origemLeadTime, x.seguranca === undefined ? '' : x.seguranca, x.minimo === undefined ? '' : x.minimo,
      x.maximo === null || x.maximo === undefined ? '' : x.maximo, x.posicao === undefined ? item.saldo : x.posicao,
      x.cobertura === null || x.cobertura === undefined ? '' : arred_(x.cobertura, 1), x.status, x.dataLimite || (x.status === 'INICIAR COMPRA' ? 'IMEDIATO' : ''),
      x.sugerido || 0, x.justificativa]);
  });

  var sh = ss.getSheetByName('RESULTADOS');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent().setBackground(null);
  if (saida.length) {
    sh.getRange(2, 1, saida.length, saida[0].length).setValues(saida);
    sh.getRange(2, 17, saida.length, 1).setNumberFormat('dd/mm/yyyy');
    var cores = saida.map(function (l) { var s = l[15]; var c = s === 'INICIAR COMPRA' || s === 'RESERVA INSUFICIENTE' ? '#f4b6b6' : s === 'EXCESSO' ? '#fce4b6' : s === 'Dentro da faixa' ? '#d9ead3' : null; return [c]; });
    sh.getRange(2, 16, saida.length, 1).setBackgrounds(cores);
  }

  // Nota e classe de cada família com as notas padrão (referência para o especialista).
  var shF = ss.getSheetByName('FAMILIAS'), lf = linhas_(ss, 'FAMILIAS');
  if (lf.length) {
    shF.getRange(2, 15, lf.length, 2).setValues(lf.map(function (r) {
      var c = criticidade({ ESS: r[4], SEG: r[5], SUB: r[6], CTL: r[7], VAR: r[8], TR: r[9], TRV: r[10] }, p.pesos, p);
      return [Math.round(c.nota), c.classe];
    }));
  }
  PropertiesService.getScriptProperties().setProperty('ULTIMO_CALCULO', new Date().toISOString());
  aviso_(saida.length + ' itens calculados.');
}

function ehPadrao_(cor) { return String(cor || '').toLowerCase() === COR_PADRAO; }

/**
 * Preenche, em cinza, as células vazias das colunas com padrão do sistema (base de consumo,
 * taxa de indisponibilidade e fases do processo de compra). Valores digitados pelo usuário
 * ficam em preto e nunca são sobrescritos; os cinzas acompanham mudanças na aba FAMILIAS.
 */
function preencherPadroes_(ss) {
  var sh = ss.getSheetByName('ITENS'), fs = ss.getSheetByName('FAMILIAS');
  if (!sh || !fs || sh.getLastRow() < 2) return;
  var fam = {};
  linhas_(ss, 'FAMILIAS').forEach(function (r) { fam[String(r[0]).trim()] = { tipo: String(r[2]).toUpperCase(), lt: num_(r[11]), base: r[12], indisp: r[13] }; });
  var n = sh.getLastRow() - 1, nc = ABAS.ITENS.length;
  var rg = sh.getRange(2, 1, n, nc), v = rg.getValues(), c = rg.getFontColors();
  var mudou = false;
  v.forEach(function (r, i) {
    var f = fam[String(r[COL.FAMILIA]).trim()]; if (!f) return;
    var fp = fasesPadrao(f.lt, DIVISAO_FASES, DISTRIBUICAO_PADRAO_DIAS);
    var padrao = {};
    padrao[COL.BASE] = f.tipo === 'CONSUMO' ? f.base : '';
    padrao[COL.INDISP] = f.tipo === 'PERMANENTE' ? f.indisp : '';
    padrao[COL.FASE_INTERNA] = fp.interna; padrao[COL.LICITACAO] = fp.licitacao; padrao[COL.CONTRATACAO] = fp.contratacao;
    padrao[COL.ENTREGA] = fp.entrega; padrao[COL.DISTRIBUICAO] = fp.distribuicao;
    COLUNAS_PADRAO.forEach(function (col) {
      if (r[col] === '' || ehPadrao_(c[i][col])) {
        if (r[col] !== padrao[col] || (padrao[col] !== '' && !ehPadrao_(c[i][col]))) { r[col] = padrao[col]; mudou = true; }
        c[i][col] = padrao[col] === '' ? null : COR_PADRAO;
      }
    });
  });
  if (mudou) rg.setValues(v);
  rg.setFontColors(c);
}

/** Ao digitar sobre um valor padrão (cinza), o valor passa a ser real (preto). */
function onEdit(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== 'ITENS' || e.range.getRow() < 2) return;
  var c0 = e.range.getColumn() - 1, nc = e.range.getNumColumns();
  for (var j = 0; j < nc; j++) {
    if (COLUNAS_PADRAO.indexOf(c0 + j) < 0) continue;
    var col = sh.getRange(e.range.getRow(), c0 + j + 1, e.range.getNumRows(), 1);
    col.setFontColor('#000000').setFontStyle('normal');
  }
}

function arred_(v, c) { if (v === null || v === undefined || v === '') return ''; var f = Math.pow(10, c); return Math.round(v * f) / f; }

/** HTML do painel: embutido (versão de arquivo único) ou do arquivo Painel.html. */
function painelHtml_() {
  return typeof PAINEL_HTML !== 'undefined' ? HtmlService.createHtmlOutput(PAINEL_HTML) : HtmlService.createHtmlOutputFromFile('Painel');
}

/** Painel web. */
function doGet() {
  return painelHtml_()
    .setTitle('Estoque mínimo - diagnóstico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function abrirPainel() {
  var html = painelHtml_().setWidth(1400).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'Diagnóstico de estoque');
}

/* ---------- Funções chamadas pelo painel (google.script.run) ---------- */

function estadoWeb() {
  var props = PropertiesService.getScriptProperties();
  var ss = planilha_();
  var sh = ss.getSheetByName('ITENS');
  return {
    acesso: !!(props.getProperty('CPELOG_USUARIO') && props.getProperty('CPELOG_SENHA')),
    usuario: props.getProperty('CPELOG_USUARIO') || '',
    nome: props.getProperty('CPELOG_NOME') || '',
    planilha: ss.getUrl(),
    ultimoImport: props.getProperty('ULTIMO_IMPORT'),
    ultimoCalculo: props.getProperty('ULTIMO_CALCULO'),
    itens: sh ? Math.max(sh.getLastRow() - 1, 0) : 0
  };
}

/** Grava e valida o login do CPELOG digitado no painel. */
function salvarAcesso(usuario, senha) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CPELOG_USUARIO', String(usuario || '').replace(/\D/g, ''));
  props.setProperty('CPELOG_SENHA', String(senha || ''));
  try { tokenCpelog_(true); } catch (e) { props.deleteProperty('CPELOG_SENHA'); throw e; }
  guardarPerfil_();
  return estadoWeb();
}

/** Puxa tudo do CPELOG, recalcula e devolve os dados do painel. */
function atualizarDoCpelog() {
  importarCpelog();
  recalcular();
  return dadosWeb();
}

/**
 * Grava edições feitas no painel e recalcula.
 * alteracoes: [{aba, linha (da planilha), coluna (1 = A), valor}]
 */
function salvarAlteracoes(alteracoes) {
  var ss = planilha_(), editaveis = { ITENS: 1, FAMILIAS: 1, PARAMETROS: 1, UNIDADES: 1, PROCESSOS: 1 };
  (alteracoes || []).forEach(function (a) {
    if (!editaveis[a.aba] || !(a.linha >= 2) || !(a.coluna >= 1)) return;
    var sh = ss.getSheetByName(a.aba), v = String(a.valor === null || a.valor === undefined ? '' : a.valor).trim();
    var cel = sh.getRange(a.linha, a.coluna);
    cel.setValue(/^-?\d+([.,]\d+)?$/.test(v) ? Number(v.replace(',', '.')) : v);
    if (a.aba === 'ITENS' && COLUNAS_PADRAO.indexOf(a.coluna - 1) >= 0) cel.setFontColor('#000000').setFontStyle('normal');
  });
  recalcular();
  return dadosWeb();
}

function serial_(v, tz) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v; }

function tabelaWeb_(ss, nome, comCores) {
  var sh = ss.getSheetByName(nome), cab = ABAS[nome], tz = ss.getSpreadsheetTimeZone();
  var n = sh && sh.getLastRow() > 1 ? sh.getLastRow() - 1 : 0;
  if (!n) return { cab: cab, linhas: [] };
  var rg = sh.getRange(2, 1, n, cab.length), v = rg.getValues(), c = comCores ? rg.getFontColors() : null;
  var linhas = [];
  v.forEach(function (r, i) {
    if (String(r[0]).trim() === '') return;
    var o = { l: i + 2, v: r.map(function (x) { return serial_(x, tz); }) };
    if (c) o.p = COLUNAS_PADRAO.filter(function (k) { return ehPadrao_(c[i][k]); });
    linhas.push(o);
  });
  return { cab: cab, linhas: linhas };
}

/** Todas as informações do painel: resultados, itens (com o que é padrão), famílias, parâmetros, unidades, processos. */
function dadosWeb() {
  var ss = planilha_();
  return {
    estado: estadoWeb(),
    resultados: tabelaWeb_(ss, 'RESULTADOS'),
    itens: tabelaWeb_(ss, 'ITENS', true),
    familias: tabelaWeb_(ss, 'FAMILIAS'),
    parametros: tabelaWeb_(ss, 'PARAMETROS'),
    unidades: tabelaWeb_(ss, 'UNIDADES'),
    processos: tabelaWeb_(ss, 'PROCESSOS'),
    colunasPadrao: COLUNAS_PADRAO,
    col: COL
  };
}
