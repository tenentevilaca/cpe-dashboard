/**
 * Gestão à Vista — Subcorregedoria CPE
 * Backend Apps Script (bound ao arquivo "ROTINA DIÁRIA SUBCORREGEDORIA CPE").
 *
 * Fonte única de verdade: CONFIG abaixo. Cada aba da planilha tem uma entrada
 * com suas colunas e "papéis" (entrada/prazo/encerramento/unidade/situação).
 * A classificação de situação (FINALIZADO / ATRASADO / EM ANDAMENTO / PENDENTE)
 * é sempre calculada aqui no servidor, nunca no cliente, para ter uma regra só.
 */

var TITULO_APP = 'Gestão à Vista — Subcorregedoria CPE';

var CONFIG = {

  DEMANDAS: {
    sheetName: 'DEMANDAS DIA A DIA',
    title: 'Demandas Dia a Dia',
    category: 'Demandas',
    description: 'Fluxo geral de demandas recebidas pela Subcorregedoria.',
    columns: [
      { key: 'dataEntrada', header: 'DATA ENTRADA', type: 'date', list: true },
      { key: 'origem', header: 'ORIGEM', type: 'text', list: true },
      { key: 'prazoUeop', header: 'PRAZO UEOP', type: 'date', list: false },
      { key: 'prazoFinal', header: 'PRAZO FINAL', type: 'date', list: true },
      { key: 'sicor', header: 'SICOR/PORTARIA', type: 'text', list: true },
      { key: 'tipoDocumento', header: 'TIPO DOCUMENTO', type: 'text', list: true },
      { key: 'finalidade', header: 'FINALIDADE', type: 'longtext', list: false },
      { key: 'destino', header: 'DESTINO', type: 'text', list: true },
      { key: 'observacoes', header: 'OBERSVAÇÕES', type: 'longtext', list: false },
      { key: 'status', header: 'STATUS', type: 'status', list: true }
    ],
    roles: { entry: 'dataEntrada', deadline: 'prazoFinal', close: null, unit: 'origem', status: 'status' }
  },

  OGECPE: {
    sheetName: 'OGECPE',
    title: 'OGE — CPE',
    category: 'Ouvidoria (OGE)',
    description: 'Manifestações da Ouvidoria-Geral direcionadas ao EM CPE.',
    columns: ogeColumns_(),
    roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
  },
  OGEBPGD: {
    sheetName: 'OGEBPGD',
    title: 'OGE — BPGD',
    category: 'Ouvidoria (OGE)',
    description: 'Manifestações da Ouvidoria-Geral direcionadas ao BPGD.',
    columns: ogeColumns_(),
    roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
  },
  OGEMAMB: {
    sheetName: 'OGEMAMB',
    title: 'OGE — BPM AMB',
    category: 'Ouvidoria (OGE)',
    description: 'Manifestações da Ouvidoria-Geral direcionadas ao BPM AMB.',
    columns: ogeColumns_(),
    roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
  },
  OGERV: {
    sheetName: 'OGERV',
    title: 'OGE — BPM RV',
    category: 'Ouvidoria (OGE)',
    description: 'Manifestações da Ouvidoria-Geral direcionadas ao BPM RV.',
    columns: ogeColumns_(),
    roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
  },

  RECOMPENSAS: {
    sheetName: 'RECOMPENSAS',
    title: 'Recompensas',
    category: 'Reconhecimento',
    description: 'Processos de recompensa em tramitação.',
    columns: [
      { key: 'data', header: 'DATA', type: 'date', list: true },
      { key: 'origem', header: 'ORIGEM', type: 'text', list: true },
      { key: 'sicor', header: 'SICOR/PORTARIA', type: 'text', list: true },
      { key: 'tipoDocumento', header: 'TIPO DOCUMENTO/NOME PM', type: 'text', list: true },
      { key: 'finalidade', header: 'FINALIDADE', type: 'longtext', list: false },
      { key: 'statusDetalhe', header: 'STATUS', type: 'text', list: false },
      { key: 'status', header: 'STATUS II', type: 'status', list: true },
      { key: 'dataEncerramento', header: 'DATA ENCERRAMENTO', type: 'date', list: true }
    ],
    roles: { entry: 'data', deadline: null, close: 'dataEncerramento', unit: 'origem', status: 'status' }
  },

  CEDMU: {
    sheetName: 'CEDMU MEDALHA',
    title: 'CEDMU — Medalhas',
    category: 'Reconhecimento',
    description: 'Processos de condecoração (medalhas) via CEDMU.',
    columns: [
      { key: 'origem', header: 'ORIGEM', type: 'text', list: true },
      { key: 'medalha', header: 'MEDALHA', type: 'text', list: true },
      { key: 'militar', header: 'Nº PM, POSTO/GRADUAÇÃO, NOME', type: 'longtext', list: true },
      { key: 'dataEntrada', header: 'DATA ENTRADA', type: 'date', list: true },
      { key: 'protocoloEntrada', header: 'PROTOCOLO ENTRADA', type: 'text', list: false },
      { key: 'dataEnvioCedmu', header: 'DATA ENVIO CEDMU', type: 'date', list: false },
      { key: 'dataDestinatario', header: 'DATA / DESTINATÁRIO', type: 'text', list: false },
      { key: 'protocoloDestinatario', header: 'PROTOCOLO / DESTINATÁRIO', type: 'text', list: false },
      { key: 'status', header: 'STATUS', type: 'status', list: true }
    ],
    roles: { entry: 'dataEntrada', deadline: null, close: null, unit: 'origem', status: 'status' }
  },

  MPMG: {
    sheetName: 'MPMG',
    title: 'MPMG',
    category: 'Disciplinar',
    description: 'Expedientes oriundos do Ministério Público de Minas Gerais.',
    columns: [
      { key: 'data', header: 'DATA', type: 'date', list: true },
      { key: 'unidade', header: 'UNIDADE', type: 'text', list: true },
      { key: 'qtDias', header: 'QT. DIA', type: 'text', list: false },
      { key: 'prazoInicial', header: 'PRAZO INICIAL', type: 'date', list: false },
      { key: 'prazoFinal', header: 'PRAZO FINAL', type: 'date', list: true },
      { key: 'sicor', header: 'N. SICOR', type: 'text', list: true },
      { key: 'observacoes', header: 'OBSERVAÇÕES', type: 'longtext', list: true },
      { key: 'status', header: 'STATUS', type: 'text', list: true }
    ],
    roles: { entry: 'data', deadline: 'prazoFinal', close: null, unit: 'unidade', status: 'status' }
  },

  CPM: {
    sheetName: 'CPM',
    title: 'CPM',
    category: 'Disciplinar',
    description: 'Solicitações do Conselho de Promoção de Militares.',
    columns: [
      { key: 'dataSolicitacao', header: 'DATA QUE A SOLICITAÇÃO DA CPM APORTOU NA SCPM-CPE', type: 'date', list: true },
      { key: 'prazoConcedido', header: 'PRAZO CONCEDIDO PELA CPM', type: 'text', list: false },
      { key: 'prazoInicial', header: 'PRAZO INICIAL', type: 'date', list: false },
      { key: 'prazoUeop', header: 'PRAZO UEOP', type: 'date', list: false },
      { key: 'prazoFinal', header: 'PRAZO FINAL', type: 'date', list: true },
      { key: 'unidade', header: 'UEOP', type: 'text', list: true },
      { key: 'sicor', header: 'Nº SICOR', type: 'text', list: true },
      { key: 'observacoes', header: 'OBSERVAÇÕES', type: 'longtext', list: false },
      { key: 'statusDetalhe', header: 'STATUS', type: 'text', list: false },
      { key: 'status', header: 'STATUS II', type: 'status', list: true },
      { key: 'dataEncerramento', header: 'DATA ENCERRAMENTO', type: 'date', list: true }
    ],
    roles: { entry: 'dataSolicitacao', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
  },

  DDU: {
    sheetName: 'DDU',
    title: 'DDU',
    category: 'Disciplinar',
    description: 'Demandas de Diligência/Denúncia via Unidade (DDU).',
    columns: [
      { key: 'unidade', header: 'UNIDADE', type: 'text', list: true },
      { key: 'dataEntrada', header: 'DATA ENTRADA SUBCORREGEDORIA', type: 'date', list: true },
      { key: 'prazoUeop', header: 'PRAZO UEOP', type: 'date', list: false },
      { key: 'prazoFinal', header: 'PRAZO FINAL', type: 'date', list: true },
      { key: 'ueop', header: 'UEOp', type: 'text', list: false },
      { key: 'sicor', header: 'SICOR', type: 'text', list: true },
      { key: 'protocoloDdu', header: 'PROTOCOLO DDU', type: 'text', list: false },
      { key: 'enviadoAtendimento', header: 'ENVIADO PARA ATENDIMENTO', type: 'text', list: false },
      { key: 'instaurado', header: 'INSTAURADO PROCEDIMENTO', type: 'text', list: true },
      { key: 'resposta', header: 'RESPOSTA', type: 'longtext', list: false },
      { key: 'status', header: 'STATUS', type: 'status', list: true },
      { key: 'dataEncerramento', header: 'DATA ENCERRAMENTO', type: 'date', list: true }
    ],
    roles: { entry: 'dataEntrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
  },

  REQUISICOES: {
    sheetName: 'REQUISIÇÕES ',
    title: 'Requisições / Audiências',
    category: 'Efetivo',
    description: 'Requisições de militares para audiências.',
    columns: [
      { key: 'dataEntrada', header: 'DATA ENTRADA', type: 'date', list: true },
      { key: 'origem', header: 'ORIGEM', type: 'text', list: true },
      { key: 'oficio', header: 'OFÍCIO', type: 'text', list: false },
      { key: 'ueopDestino', header: 'UEOP DESTINO', type: 'text', list: true },
      { key: 'dataDestino', header: 'DATA DESTINO', type: 'date', list: false },
      { key: 'militar', header: 'NÚMERO PM/NOME', type: 'longtext', list: true },
      { key: 'processo', header: 'PROCESSO Nº', type: 'text', list: true },
      { key: 'audiencia', header: 'LOCAL/DATA /HORA AUDIÊNCIA', type: 'longtext', list: true },
      { key: 'modalidade', header: 'PRESENCIAL/ONLINE', type: 'text', list: false },
      { key: 'enviadoIntranet', header: 'ENVIADO VIA INTRANET PM', type: 'text', list: false },
      { key: 'observacao', header: 'OBSERVAÇÃO', type: 'longtext', list: false }
    ],
    roles: { entry: 'dataEntrada', deadline: null, close: null, unit: 'origem', status: null }
  },

  RECURDISC: {
    sheetName: 'RECURDISC',
    title: 'Recursos Disciplinares',
    category: 'Disciplinar',
    description: 'Recursos disciplinares em 1ª e 2ª instância.',
    columns: [
      { key: 'data', header: 'DATA', type: 'date', list: true },
      { key: 'origem', header: 'ORIGEM', type: 'text', list: true },
      { key: 'sicor', header: 'SICOR/PORTARIA', type: 'text', list: true },
      { key: 'tipoDocumento', header: 'TIPO DOCUMENTO/1ª OU 2ª INST', type: 'text', list: true },
      { key: 'finalidade', header: 'FINALIDADE', type: 'longtext', list: false },
      { key: 'destino', header: 'DESTINO', type: 'text', list: true },
      { key: 'status', header: 'STATUS', type: 'text', list: true }
    ],
    roles: { entry: 'data', deadline: null, close: null, unit: 'origem', status: 'status' }
  },

  CPEPRESO: {
    sheetName: 'MILITAR CPEPRESO',
    title: 'Militares Presos',
    category: 'Efetivo',
    description: 'Controle de militares presos sob acompanhamento do CPE.',
    columns: [
      { key: 'numeroPm', header: 'NÚMERO PM', type: 'text', list: true },
      { key: 'nome', header: 'NOME', type: 'text', list: true },
      { key: 'processo', header: 'IPM/APF/PROC/APFD/REDS', type: 'text', list: true },
      { key: 'dataPrisao', header: 'DATA PRISÃO', type: 'date', list: true },
      { key: 'fato', header: 'FATO', type: 'longtext', list: false },
      { key: 'unidade', header: 'LOTADO/UEOP', type: 'text', list: true },
      { key: 'presoEm', header: 'PRESO UPM', type: 'text', list: false },
      { key: 'status', header: 'STATUS', type: 'text', list: true }
    ],
    roles: { entry: 'dataPrisao', deadline: null, close: null, unit: 'unidade', status: 'status' },
    emptyStatusMeaning: 'PRESO — SEM ATUALIZAÇÃO REGISTRADA'
  },

  PADCPE: {
    sheetName: 'PADCPE',
    title: 'PAD — CPE',
    category: 'Disciplinar',
    description: 'Processos Administrativos Disciplinares. Atenção ao prazo de prescrição.',
    columns: [
      { key: 'sirh', header: 'sirh', type: 'text', list: true },
      { key: 'nome', header: 'NOME', type: 'text', list: true },
      { key: 'portaria', header: 'PORTARIA PAD', type: 'text', list: true },
      { key: 'dataFato', header: 'DATA DO FATO', type: 'date', list: true },
      { key: 'prescricao', header: 'PRESCRIÇÃO', type: 'date', list: true },
      { key: 'fato', header: 'FATO', type: 'longtext', list: false },
      { key: 'militarPreso', header: 'MILITAR PRESO', type: 'text', list: false },
      { key: 'observacao', header: 'OBSERVAÇÃO', type: 'longtext', list: false },
      { key: 'status', header: 'SITUAÇÃO', type: 'text', list: true }
    ],
    roles: { entry: 'dataFato', deadline: 'prescricao', close: null, unit: null, status: 'status' },
    deadlineLabel: 'Prescrição'
  },

  DESERCAO: {
    sheetName: 'DESERÇÂO',
    title: 'Deserção',
    category: 'Efetivo',
    description: 'Processos de deserção em andamento.',
    columns: [
      { key: 'militar', header: 'DADOS DO MILITAR', type: 'longtext', list: true },
      { key: 'unidade', header: 'UNIDADE', type: 'text', list: true },
      { key: 'dataEntrada', header: 'ENTRADA SUBCORREGEDORIA', type: 'date', list: true },
      { key: 'sicor', header: 'SICOR', type: 'text', list: false },
      { key: 'portaria', header: 'PORTARIA SICOR', type: 'text', list: false },
      { key: 'dataInstauracao', header: 'DATA INSTAURAÇÃO', type: 'date', list: false },
      { key: 'prazoFinal', header: 'DATA FINAL/PREVISTA', type: 'date', list: true },
      { key: 'protocoloTj', header: 'PROTOCOLO PA TJ DISTRIBUIÇÃO', type: 'text', list: false },
      { key: 'dataEncTjm', header: 'DATA DO ENC. AO TJM MG', type: 'date', list: false },
      { key: 'solucao', header: 'SOLUÇÃO', type: 'longtext', list: true },
      { key: 'dataEncerramento', header: 'FINALIZADO', type: 'date', list: true },
      { key: 'observacao', header: 'OBSERVAÇÃO', type: 'longtext', list: false }
    ],
    roles: { entry: 'dataEntrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: null }
  },

  TAD: {
    sheetName: 'TAD',
    title: 'TAD',
    category: 'Disciplinar',
    description: 'Termos de Ajustamento de Disciplina (Art. 15 CEDM).',
    columns: [
      { key: 'numero', header: 'NÚMERO', type: 'text', list: true },
      { key: 'posto', header: 'POSTO/GRAD', type: 'text', list: true },
      { key: 'nome', header: 'NOME COMPLETO', type: 'text', list: true },
      { key: 'unidade', header: 'UNIDADE', type: 'text', list: true },
      { key: 'cidade', header: 'CIDADE', type: 'text', list: false },
      { key: 'art15', header: 'ART. 15 CEDM (S/CONCURSO)', type: 'text', list: false },
      { key: 'acordo', header: 'ACORDO FIRMADO', type: 'text', list: true },
      { key: 'prazoCumprimento', header: 'PRAZO CUMPRIMENTO ACORDO', type: 'date', list: true },
      { key: 'ressarcimento', header: 'RESSARCIMENTO AO ERÁRIO,SE HOUVER', type: 'text', list: false },
      { key: 'dataAssinatura', header: 'DATA ASSINATURA TADIS', type: 'date', list: true }
    ],
    roles: { entry: 'dataAssinatura', deadline: 'prazoCumprimento', close: null, unit: 'unidade', status: null }
  },

  SNGB: {
    sheetName: 'SNGB',
    title: 'SNGB',
    category: 'Efetivo',
    description: 'Ocorrências SNGB (armas/material apreendido).',
    columns: [
      { key: 'numero', header: 'NÚMERO', type: 'text', list: true },
      { key: 'posto', header: 'POSTO/GRAD', type: 'text', list: true },
      { key: 'nome', header: 'NOME COMPLETO', type: 'text', list: true },
      { key: 'unidade', header: 'UNIDADE', type: 'text', list: true },
      { key: 'cidade', header: 'CIDADE', type: 'text', list: false },
      { key: 'sicor', header: 'SICOR', type: 'text', list: true },
      { key: 'procedimento', header: 'PROCEDIMENTO', type: 'text', list: true },
      { key: 'materiais', header: 'MATERIAS APREENDIDOS', type: 'longtext', list: false },
      { key: 'observacoes', header: 'OBSERVAÇÕES', type: 'longtext', list: false }
    ],
    roles: { entry: null, deadline: null, close: null, unit: 'unidade', status: null }
  }
};

// Colunas compartilhadas pelas 4 abas OGE* (mesmo layout).
function ogeColumns_() {
  return [
    { key: 'mgouv', header: 'MGOUV', type: 'text', list: false },
    { key: 'unidade', header: 'UNIDADE', type: 'text', list: true },
    { key: 'entrada', header: 'ENTRADA', type: 'date', list: true },
    { key: 'prazoUeop', header: 'PRAZO UEOP', type: 'date', list: false },
    { key: 'prazoFinal', header: 'PRAZO FINAL', type: 'date', list: true },
    { key: 'sicor', header: 'SICOR', type: 'text', list: true },
    { key: 'processo', header: 'PROCESSO', type: 'text', list: false },
    { key: 'prorrogacao', header: 'PRORROGAÇÃO', type: 'text', list: false },
    { key: 'sobrestamento', header: 'SOBRESTAMENTO', type: 'text', list: false },
    { key: 'objeto', header: 'OBJETO', type: 'longtext', list: true },
    { key: 'observacoes', header: 'OBSERVAÇÕES', type: 'longtext', list: false },
    { key: 'status', header: 'STATUS', type: 'status', list: true },
    { key: 'dataEncerramento', header: 'DATA ENCERRAMENTO', type: 'date', list: true }
  ];
}

var CATEGORY_ORDER = ['Demandas', 'Ouvidoria (OGE)', 'Disciplinar', 'Efetivo', 'Reconhecimento'];

// Palavras que indicam conclusão quando o campo de status é texto livre.
var PALAVRAS_CONCLUIDO = [
  'FINALIZ', 'RESPONDID', 'ENCERR', 'ARQUIV', 'SOLTO', 'EXCLU',
  'TRANSFER', 'RECOMPENSAD', 'CONCLUÍD', 'CONCLUID', 'ENTREGUE'
];

function doGet(e) {
  var tpl = HtmlService.createTemplateFromFile('Index');
  var out = tpl.evaluate()
    .setTitle(TITULO_APP)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------- Leitura de planilha ----------

function getSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Aba não encontrada: "' + sheetName + '"');
  return sheet;
}

function norm_(s) {
  return String(s == null ? '' : s).trim().toUpperCase();
}

function buildHeaderIndex_(headerRow) {
  var map = {};
  headerRow.forEach(function (h, i) {
    var n = norm_(h);
    if (n && map[n] === undefined) map[n] = i;
  });
  return map;
}

function cellToJson_(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss");
  }
  if (type === 'date') {
    // número solto numa coluna de data (ex.: "2025" usado como divisor de seção) não é uma data real
    if (typeof value === 'number') return null;
    // valor de data gravado como texto na planilha (ex.: "17/05/24") — mantém como texto
    return String(value).trim();
  }
  return typeof value === 'number' ? value : String(value).trim();
}

/** Lê uma aba inteira segundo o CONFIG e devolve linhas já no formato {key: valor} + _situacao. */
function readConfiguredSheet_(cfg) {
  var sheet = getSheet_(cfg.sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headerIdx = buildHeaderIndex_(values[0]);

  var colLookup = cfg.columns.map(function (c) {
    return { key: c.key, type: c.type, idx: headerIdx[norm_(c.header)] };
  });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    var hasAny = raw.some(function (v) { return v !== null && v !== ''; });
    if (!hasAny) continue;

    var obj = { _row: r + 1 };
    colLookup.forEach(function (c) {
      obj[c.key] = c.idx === undefined ? null : cellToJson_(raw[c.idx], c.type);
    });

    // ignora linhas "fantasma" (ex.: um ano solto deixado como divisor de seção)
    var chave = cfg.roles.entry || cfg.roles.unit;
    if (chave && !obj[chave]) continue;

    var sit = classify_(obj, cfg);
    obj._situacao = sit.situacao;
    obj._situacaoCor = sit.cor;
    rows.push(obj);
  }
  return rows;
}

function parseAnyDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var s = String(v).trim();
  // aceita "yyyy-MM-ddT..." (já normalizado) ou "dd/mm/yyyy"
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    var yy = Number(br[3]);
    if (yy < 100) yy += 2000;
    return new Date(yy, Number(br[2]) - 1, Number(br[1]));
  }
  return null;
}

function textIndicaConcluido_(text) {
  var n = norm_(text);
  return PALAVRAS_CONCLUIDO.some(function (p) { return n.indexOf(p) !== -1; });
}

/**
 * Regra única de classificação de situação, usada tanto na visão consolidada
 * (cards da Home) quanto na tabela de cada aba.
 */
function classify_(obj, cfg) {
  var roles = cfg.roles;
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (roles.close) {
    var closeVal = obj[roles.close];
    if (closeVal) return { situacao: 'FINALIZADO', cor: 'verde' };
  }

  if (roles.status) {
    var statusVal = obj[roles.status];
    if (statusVal) {
      if (cfg.columns.filter(function(c){return c.key===roles.status;})[0].type === 'status') {
        // campo já é um enum limpo (ex.: FINALIZADO / EM ANDAMENTO)
        var n = norm_(statusVal);
        if (n.indexOf('FINALIZ') !== -1) return { situacao: 'FINALIZADO', cor: 'verde' };
        if (n.indexOf('ANDAMENTO') !== -1) return { situacao: 'EM ANDAMENTO', cor: 'azul' };
      }
      if (textIndicaConcluido_(statusVal)) return { situacao: 'FINALIZADO', cor: 'verde' };
    } else if (cfg.emptyStatusMeaning) {
      return { situacao: cfg.emptyStatusMeaning, cor: 'vermelho' };
    }
  }

  if (roles.deadline) {
    var dl = parseAnyDate_(obj[roles.deadline]);
    if (dl && dl < hoje) return { situacao: 'ATRASADO', cor: 'vermelho' };
  }

  if (roles.status && obj[roles.status]) return { situacao: 'EM ANDAMENTO', cor: 'azul' };
  if (roles.deadline) return { situacao: 'EM ANDAMENTO', cor: 'azul' };
  return { situacao: 'SEM STATUS', cor: 'cinza' };
}

// ---------- API chamada pelo cliente ----------

function getAppConfig() {
  var list = [];
  Object.keys(CONFIG).forEach(function (id) {
    var c = CONFIG[id];
    list.push({
      id: id,
      sheetName: c.sheetName,
      title: c.title,
      category: c.category,
      description: c.description,
      columns: c.columns,
      roles: c.roles,
      deadlineLabel: c.deadlineLabel || 'Prazo final'
    });
  });
  return { categories: CATEGORY_ORDER, sheets: list };
}

function getHomeSummary() {
  var result = [];
  Object.keys(CONFIG).forEach(function (id) {
    var cfg = CONFIG[id];
    var counts = { FINALIZADO: 0, ATRASADO: 0, 'EM ANDAMENTO': 0, OUTROS: 0, total: 0 };
    try {
      var rows = readConfiguredSheet_(cfg);
      rows.forEach(function (r) {
        counts.total++;
        if (r._situacao === 'FINALIZADO') counts.FINALIZADO++;
        else if (r._situacao === 'ATRASADO') counts.ATRASADO++;
        else if (r._situacao === 'EM ANDAMENTO') counts['EM ANDAMENTO']++;
        else counts.OUTROS++;
      });
    } catch (err) {
      counts.error = String(err);
    }
    result.push({
      id: id, title: cfg.title, category: cfg.category,
      description: cfg.description, counts: counts
    });
  });
  return result;
}

function getSheetView(id) {
  var cfg = CONFIG[id];
  if (!cfg) throw new Error('Aba desconhecida: ' + id);
  var rows = readConfiguredSheet_(cfg);
  return {
    id: id, title: cfg.title, description: cfg.description,
    columns: cfg.columns, roles: cfg.roles,
    deadlineLabel: cfg.deadlineLabel || 'Prazo final',
    rows: rows
  };
}

/** Página especial ENCARREGADOS: 3 sub-tabelas com layout próprio (não segue o padrão colunar). */
function getEncarregadosView() {
  var sheet = getSheet_('ENCARREGADOS');
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 6);
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  function isBlankRow(row) { return row.every(function (v) { return v === null || v === ''; }); }

  var blocks = [];
  var i = 0;
  while (i < values.length) {
    var row = values[i];
    if (row[0] && typeof row[0] === 'string' && isBlankRow(row.slice(1))) {
      // linha de título de bloco
      var heading = String(row[0]).trim();
      i++;
      // pula linhas de contexto (ano, período) até achar o cabeçalho de tabela
      var subLabel = null;
      while (i < values.length && !isBlankRow(values[i]) && norm_(values[i][0]) !== 'UNIDADE' && norm_(values[i][0]) !== 'DATA ENTRADA') {
        if (values[i][0]) subLabel = (subLabel ? subLabel + ' · ' : '') + String(values[i][0]).trim();
        i++;
      }
      if (i < values.length && !isBlankRow(values[i])) {
        var header = values[i].map(function (h) { return h ? String(h).trim() : ''; });
        i++;
        var dataRows = [];
        while (i < values.length && !isBlankRow(values[i]) && !(values[i][0] && isBlankRow(values[i].slice(1)))) {
          var r = values[i];
          if (!isBlankRow(r)) {
            var obj = {};
            header.forEach(function (h, idx) { if (h) obj[h] = r[idx] instanceof Date ? cellToJson_(r[idx], 'date') : r[idx]; });
            dataRows.push(obj);
          }
          i++;
        }
        blocks.push({ heading: heading, subLabel: subLabel, header: header.filter(String), rows: dataRows });
        continue;
      }
    }
    i++;
  }
  return { title: 'Encarregados', blocks: blocks };
}
