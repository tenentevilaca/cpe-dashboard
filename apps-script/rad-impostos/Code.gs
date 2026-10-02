/**
 * Painel de Impostos — RAD União
 * Lê a aba de base de dados da planilha e serve o painel (Index.html).
 *
 * Uso:
 *  - Menu "📊 Painel de Impostos" > "Abrir painel" (janela dentro da planilha), ou
 *  - Implantar > Nova implantação > App da Web (abre em tela cheia no navegador).
 */

// Nome da aba com os dados. Se não existir, o script procura a aba que tem o cabeçalho "Placa".
var ABA_DADOS = 'BADE SE DADOS';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Painel de Impostos')
    .addItem('Abrir painel', 'abrirPainel')
    .addToUi();
}

function abrirPainel() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Painel de Impostos — RAD');
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Painel de Impostos — RAD')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Localiza a aba de dados. */
function obterAba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_DADOS);
  if (aba) return aba;
  var abas = ss.getSheets();
  for (var i = 0; i < abas.length; i++) {
    var h = abas[i].getRange(1, 1, 1, Math.max(1, abas[i].getLastColumn())).getValues()[0];
    if (String(h[0]).trim().toLowerCase() === 'placa') return abas[i];
  }
  throw new Error('Aba de dados não encontrada. Ajuste ABA_DADOS no Code.gs.');
}

/**
 * Índice da N-ésima ocorrência de um cabeçalho (a base tem "% IRRF" e "IRRF"
 * duas vezes: a 1ª é da peça, a 2ª é do serviço).
 */
function col_(cab, nome, ocorrencia) {
  ocorrencia = ocorrencia || 1;
  var alvo = nome.trim().toLowerCase();
  var achou = 0;
  for (var i = 0; i < cab.length; i++) {
    if (String(cab[i]).trim().toLowerCase() === alvo) {
      achou++;
      if (achou === ocorrencia) return i;
    }
  }
  return -1;
}

function num_(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === '' || v === undefined) return 0;
  var s = String(v).replace(/[^\d,.\-]/g, '');
  if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function txt_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Chamado pelo painel: devolve as notas já normalizadas. */
function getDados() {
  var aba = obterAba_();
  var valores = aba.getDataRange().getValues();
  var cab = valores[0];

  var c = {
    placa: col_(cab, 'Placa'),
    unidade: col_(cab, 'UNIDADE'),
    modelo: col_(cab, 'Modelo Veículo'),
    os: col_(cab, 'Ordem de Serviço'),
    cnpj: col_(cab, 'CNPJ'),
    estab: col_(cab, 'Estabelecimento'),
    cidade: col_(cab, 'Endereço Estabelecimento'),
    simples: col_(cab, 'Optante Simples'),
    nfPeca: col_(cab, 'NF Peça'),
    pIcms: col_(cab, '% ICMS'),
    icms: col_(cab, 'Valor ICMS Deduzido'),
    pIrPeca: col_(cab, '% IRRF', 1),
    irPeca: col_(cab, 'IRRF', 1),
    vPeca: col_(cab, 'Valor a Pagar Peça'),
    nfServ: col_(cab, 'NF Serviço'),
    pIss: col_(cab, '% ISSQN'),
    iss: col_(cab, 'Valor ISSQN Retido'),
    respIss: col_(cab, 'Responsável ISSQN'),
    pIrServ: col_(cab, '% IRRF', 2),
    irServ: col_(cab, 'IRRF', 2),
    vServ: col_(cab, 'Valor Serviço'),
    aprovado: col_(cab, 'Valor Aprovado'),
    liquido: col_(cab, 'Valor Liquido'),
    adm: col_(cab, 'Valor Adm'),
    data: col_(cab, 'Data Aprovação Pré-Faturamento'),
    resp: col_(cab, 'Responsável Aprovação Pré-Faturamento')
  };

  var g = function (linha, k) { return c[k] < 0 ? '' : linha[c[k]]; };
  var tz = Session.getScriptTimeZone();
  var notas = [];

  for (var r = 1; r < valores.length; r++) {
    var l = valores[r];
    if (!txt_(g(l, 'placa')) && !txt_(g(l, 'estab'))) continue;

    var pIcmsBruto = g(l, 'pIcms');
    var data = g(l, 'data');

    notas.push({
      placa: txt_(g(l, 'placa')),
      unidade: txt_(g(l, 'unidade')),
      modelo: txt_(g(l, 'modelo')),
      os: txt_(g(l, 'os')),
      cnpj: txt_(g(l, 'cnpj')),
      estab: txt_(g(l, 'estab')),
      cidade: txt_(g(l, 'cidade')),
      simples: txt_(g(l, 'simples')),
      nfPeca: txt_(g(l, 'nfPeca')),
      pIcms: typeof pIcmsBruto === 'number' ? pIcmsBruto : num_(pIcmsBruto),
      icmsObs: typeof pIcmsBruto === 'number' ? '' : txt_(pIcmsBruto),
      icms: num_(g(l, 'icms')),
      pIrPeca: num_(g(l, 'pIrPeca')),
      irPeca: num_(g(l, 'irPeca')),
      vPeca: num_(g(l, 'vPeca')),
      nfServ: txt_(g(l, 'nfServ')),
      pIss: num_(g(l, 'pIss')),
      iss: num_(g(l, 'iss')),
      respIss: txt_(g(l, 'respIss')),
      pIrServ: num_(g(l, 'pIrServ')),
      irServ: num_(g(l, 'irServ')),
      vServ: num_(g(l, 'vServ')),
      aprovado: num_(g(l, 'aprovado')),
      liquido: num_(g(l, 'liquido')),
      adm: num_(g(l, 'adm')),
      data: data instanceof Date ? Utilities.formatDate(data, tz, 'dd/MM/yyyy HH:mm') : txt_(data),
      resp: txt_(g(l, 'resp'))
    });
  }

  return {
    aba: aba.getName(),
    planilha: SpreadsheetApp.getActiveSpreadsheet().getName(),
    atualizadoEm: Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm'),
    notas: notas
  };
}
