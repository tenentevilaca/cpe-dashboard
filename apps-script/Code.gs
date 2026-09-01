/**
 * Gestão à Vista — Subcorregedoria CPE
 * Backend Apps Script (bound ao arquivo "ROTINA DIÁRIA SUBCORREGEDORIA CPE").
 *
 * Duas fontes de verdade:
 *  - CONFIG: abas que continuam sozinhas, cada uma com suas colunas e "papéis"
 *    (entrada/prazo/encerramento/unidade/status).
 *  - GRUPOS: painéis que juntam várias abas parecidas num só (ex.: as 4 OGE),
 *    com um filtro de "Tipo" pra escolher a origem (ou "Todas"). Cada membro
 *    de um grupo tem seus próprios papéis + um campo "assunto" (qual coluna
 *    mostrar como resumo na tabela consolidada).
 *
 * A classificação de situação (FINALIZADO / ATRASADO / EM ANDAMENTO / SEM STATUS)
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

  CPEPRESO: {
    sheetName: 'MILITAR CPE/PRESO',
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

var GRUPOS = {

  OUVIDORIA: {
    title: 'Ouvidoria (OGE)',
    category: 'Ouvidoria',
    description: 'Manifestações da Ouvidoria-Geral do Estado, por unidade destinatária.',
    membros: [
      {
        tipo: 'EM CPE', sheetName: 'OGE/CPE', columns: ogeColumns_(), assunto: 'objeto',
        roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
      },
      {
        tipo: 'BPGD', sheetName: 'OGE/BPGD', columns: ogeColumns_(), assunto: 'objeto',
        roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
      },
      {
        tipo: 'BPM AMB', sheetName: 'OGE/MAMB', columns: ogeColumns_(), assunto: 'objeto',
        roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
      },
      {
        tipo: 'BPM RV', sheetName: 'OGE/RV', columns: ogeColumns_(), assunto: 'objeto',
        roles: { entry: 'entrada', deadline: 'prazoFinal', close: 'dataEncerramento', unit: 'unidade', status: 'status' }
      }
    ]
  },

  RECOMPENSAS: {
    title: 'Recompensas e Medalhas',
    category: 'Reconhecimento',
    description: 'Processos de recompensa e condecoração (CEDMU) em tramitação.',
    membros: [
      {
        tipo: 'Recompensa', sheetName: 'RECOMPENSAS', assunto: 'finalidade',
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
      {
        tipo: 'Medalha (CEDMU)', sheetName: 'CEDMU MEDALHA', assunto: 'militar',
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
      }
    ]
  },

  DENUNCIAS: {
    title: 'Denúncias',
    category: 'Disciplinar',
    description: 'Denúncias e expedientes externos: Ministério Público (MPMG), CPM e DDU.',
    membros: [
      {
        tipo: 'MPMG', sheetName: 'MPMG', assunto: 'observacoes',
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
      {
        tipo: 'CPM', sheetName: 'CPM', assunto: 'observacoes',
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
      {
        tipo: 'DDU', sheetName: 'DDU', assunto: 'instaurado',
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
      }
    ]
  },

  DISCIPLINA: {
    title: 'Disciplina',
    category: 'Disciplinar',
    description: 'PAD, deserção, TAD e recursos disciplinares. Veja também a aba Encarregados, ao lado.',
    membros: [
      {
        tipo: 'PAD', sheetName: 'PAD/CPE', assunto: 'fato', deadlineLabel: 'Prescrição',
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
        roles: { entry: 'dataFato', deadline: 'prescricao', close: null, unit: null, status: 'status' }
      },
      {
        tipo: 'Deserção', sheetName: 'DESERÇÂO', assunto: 'solucao',
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
      {
        tipo: 'TAD', sheetName: 'TAD', assunto: 'nome',
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
      {
        tipo: 'Recursos', sheetName: 'RECUR/DISC', assunto: 'finalidade',
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
      }
    ]
  }
};

var CATEGORY_ORDER = ['Demandas', 'Ouvidoria', 'Disciplinar', 'Efetivo', 'Reconhecimento'];

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

/** Lê uma aba inteira segundo o cfg (de CONFIG ou de um membro de GRUPOS) e devolve
 *  linhas já no formato {key: valor} + _situacao. */
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

/** Lê todos os membros de um grupo e devolve uma lista única de linhas, cada uma
 *  marcada com _tipo (qual membro/origem) e com atalhos _dataValor/_unidadeValor/
 *  _assuntoValor pra a tabela consolidada não precisar saber a coluna exata de
 *  cada membro. As colunas originais continuam no objeto pra o popup de detalhes. */
function readGrupo_(grupo) {
  var todasLinhas = [];
  grupo.membros.forEach(function (m) {
    var linhas = readConfiguredSheet_(m);
    linhas.forEach(function (r) {
      r._tipo = m.tipo;
      r._uid = m.tipo + '#' + r._row;
      r._dataValor = m.roles.entry ? r[m.roles.entry] : null;
      r._unidadeValor = m.roles.unit ? r[m.roles.unit] : null;
      r._assuntoValor = m.assunto ? r[m.assunto] : null;
    });
    todasLinhas = todasLinhas.concat(linhas);
  });
  todasLinhas.sort(function (a, b) {
    var da = parseAnyDate_(a._dataValor);
    var db = parseAnyDate_(b._dataValor);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });
  return todasLinhas;
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
 * (cards da Home) quanto na tabela de cada aba/grupo.
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
  var sheets = [];
  Object.keys(CONFIG).forEach(function (id) {
    var c = CONFIG[id];
    sheets.push({
      id: id, isGroup: false, sheetName: c.sheetName,
      title: c.title, category: c.category, description: c.description,
      columns: c.columns, roles: c.roles, deadlineLabel: c.deadlineLabel || 'Prazo final'
    });
  });

  var grupos = [];
  Object.keys(GRUPOS).forEach(function (id) {
    var g = GRUPOS[id];
    grupos.push({
      id: id, isGroup: true, title: g.title, category: g.category, description: g.description,
      membros: g.membros.map(function (m) {
        return { tipo: m.tipo, columns: m.columns, roles: m.roles, deadlineLabel: m.deadlineLabel || 'Prazo final' };
      })
    });
  });

  return { categories: CATEGORY_ORDER, sheets: sheets, grupos: grupos };
}

function getHomeSummary() {
  var result = [];

  function contar(rows) {
    var counts = { FINALIZADO: 0, ATRASADO: 0, 'EM ANDAMENTO': 0, OUTROS: 0, total: 0 };
    rows.forEach(function (r) {
      counts.total++;
      if (r._situacao === 'FINALIZADO') counts.FINALIZADO++;
      else if (r._situacao === 'ATRASADO') counts.ATRASADO++;
      else if (r._situacao === 'EM ANDAMENTO') counts['EM ANDAMENTO']++;
      else counts.OUTROS++;
    });
    return counts;
  }

  Object.keys(CONFIG).forEach(function (id) {
    var cfg = CONFIG[id];
    var counts = { FINALIZADO: 0, ATRASADO: 0, 'EM ANDAMENTO': 0, OUTROS: 0, total: 0 };
    try {
      counts = contar(readConfiguredSheet_(cfg));
    } catch (err) {
      counts.error = String(err);
    }
    result.push({ id: id, isGroup: false, title: cfg.title, category: cfg.category, description: cfg.description, counts: counts });
  });

  Object.keys(GRUPOS).forEach(function (id) {
    var grupo = GRUPOS[id];
    var counts = { FINALIZADO: 0, ATRASADO: 0, 'EM ANDAMENTO': 0, OUTROS: 0, total: 0 };
    try {
      counts = contar(readGrupo_(grupo));
    } catch (err) {
      counts.error = String(err);
    }
    result.push({ id: id, isGroup: true, title: grupo.title, category: grupo.category, description: grupo.description, counts: counts });
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

function getGroupView(id) {
  var grupo = GRUPOS[id];
  if (!grupo) throw new Error('Grupo desconhecido: ' + id);
  var rows = readGrupo_(grupo);
  return {
    id: id, title: grupo.title, description: grupo.description,
    membros: grupo.membros.map(function (m) {
      return { tipo: m.tipo, columns: m.columns, roles: m.roles, deadlineLabel: m.deadlineLabel || 'Prazo final' };
    }),
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
