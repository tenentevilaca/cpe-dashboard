/**
 * Painel de Impostos — RAD
 *
 * Fontes de dados (nesta ordem):
 *  1. Pastas do Google Drive (PASTA_RADS_PADRAO / PASTA_NOTAS_PADRAO ou as escolhidas no painel):
 *     - RADs: "Relatório Sintético da Despesa - RAD" (.xls exportados do sistema), um por unidade;
 *     - Notas: notas fiscais em PDF (inclusive em subpastas).
 *  2. Se as duas constantes estiverem vazias: a aba ABA_DADOS desta planilha.
 *
 * O texto dos PDFs é extraído pelo OCR do Google Drive (serviço avançado "Drive API")
 * e guardado na aba oculta "_cache_pdf" para não ser lido de novo.
 */

// Pastas do Google Drive (podem ser trocadas pelo botão "📁 Pastas do Drive" no painel).
var PASTA_RADS_PADRAO = '1_-qJQUiIDqJsPO7vpuMxBZP2bQ46gphf';   // RADs de cada unidade
var PASTA_NOTAS_PADRAO = '1Sf2E0M96jh5RfWvbpIZTwE26Ef995d3B';  // PDFs das notas fiscais

var ABA_DADOS = 'BADE SE DADOS';
var ABA_CACHE = '_cache_pdf';
var PASTA_ZIP = 'Notas tomador (painel)';
var LIMITE_SEGUNDOS = 240; // cada chamada de leitura de PDFs para antes de 4 min (o Apps Script corta em 6)

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Painel de Impostos')
    .addItem('Abrir painel', 'abrirPainel')
    .addToUi();
}

function abrirPainel() {
  var html = HtmlService.createHtmlOutputFromFile('Index').setWidth(1400).setHeight(900);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Painel de Impostos — RAD');
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Painel de Impostos — RAD')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ------------------------------------------------------------------ */
/* Configuração da pasta                                              */
/* ------------------------------------------------------------------ */

function idDaPasta_(texto) {
  texto = String(texto || '').trim();
  var m = /folders\/([\w-]{10,})/.exec(texto) || /[?&]id=([\w-]{10,})/.exec(texto) || /^([\w-]{10,})$/.exec(texto);
  return m ? m[1] : '';
}

/** Chamado pelo painel: salva as pastas (links ou IDs). Vazio = volta para a pasta padrão. */
function salvarPastas(rads, notas) {
  var cfg = {};
  [['rads', rads], ['notas', notas]].forEach(function (par) {
    if (!String(par[1] || '').trim()) return;
    var id = idDaPasta_(par[1]);
    if (!id) throw new Error('Link de pasta inválido: ' + par[1]);
    DriveApp.getFolderById(id).getName(); // valida o acesso
    cfg[par[0]] = id;
  });
  PropertiesService.getScriptProperties().setProperty('PASTAS', JSON.stringify(cfg));
  return getConfig();
}

function idsPastas_() {
  var cfg = {};
  try { cfg = JSON.parse(PropertiesService.getScriptProperties().getProperty('PASTAS') || '{}'); } catch (e) {}
  return { rads: cfg.rads || PASTA_RADS_PADRAO, notas: cfg.notas || PASTA_NOTAS_PADRAO };
}

function abrirPasta_(id, papel) {
  if (!id) return null;
  try { return DriveApp.getFolderById(id); }
  catch (e) { throw new Error('Sem acesso à pasta de ' + papel + ' (' + id + '). Verifique se ela está compartilhada com a sua conta.'); }
}

/* ------------------------------------------------------------------ */
/* Carga principal                                                     */
/* ------------------------------------------------------------------ */

/**
 * Chamado pelo painel. Devolve:
 *  - modo "drive": { rads: [{id, nome, html}], pdfs: [{id, nome, url, tamanho, atualizado, texto?}] }
 *  - modo "planilha": { cab, linhas } da aba de dados.
 */
function getFontes() {
  var tz = Session.getScriptTimeZone();
  var agora = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
  var ids = idsPastas_();

  if (!ids.rads && !ids.notas) {
    var aba = obterAba_();
    var valores = aba.getDataRange().getValues().map(function (l) {
      return l.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'dd/MM/yyyy HH:mm') : v; });
    });
    return {
      modo: 'planilha', origem: SpreadsheetApp.getActiveSpreadsheet().getName() + ' · aba “' + aba.getName() + '”',
      atualizadoEm: agora, cab: valores[0], linhas: valores.slice(1)
    };
  }

  var pastaRads = abrirPasta_(ids.rads, 'RADs');
  var pastaNotas = abrirPasta_(ids.notas, 'notas');
  var rads = [], pdfs = [], vistos = {}, ignorados = [];
  var cache = lerCache_();

  var tratar = function (arq, caminho) {
    var id = arq.getId();
    if (vistos[id]) return;
    vistos[id] = 1;
    var nome = arq.getName();
    var mime = arq.getMimeType();
    if (mime === MimeType.PDF || /\.pdf$/i.test(nome)) {
      var atualizado = arq.getLastUpdated().getTime();
      var c = cache[id];
      pdfs.push({
        id: id, nome: nome, caminho: caminho, url: arq.getUrl(), tamanho: arq.getSize(), atualizado: atualizado,
        texto: c && c.atualizado === atualizado ? c.texto : null
      });
    } else if (mime === MimeType.GOOGLE_SHEETS || mime === MimeType.MICROSOFT_EXCEL || mime === MimeType.MICROSOFT_EXCEL_LEGACY ||
               /\.(xlsx|xlsm|xls|html?)$/i.test(nome) || /rad/i.test(nome)) {
      try {
        var rad = lerRadArquivo_(arq, mime);
        if (rad) { rad.id = id; rad.nome = caminho + nome; rads.push(rad); }
        else ignorados.push(caminho + nome);
      } catch (e) {
        ignorados.push(caminho + nome + ' (erro: ' + (e && e.message || e) + ')');
      }
    }
  };
  if (pastaRads) listarArquivos_(pastaRads, '', tratar);
  if (pastaNotas) listarArquivos_(pastaNotas, '', tratar);

  var nomes = [pastaRads && 'RADs: “' + pastaRads.getName() + '”', pastaNotas && 'Notas: “' + pastaNotas.getName() + '”'].filter(String);
  return {
    modo: 'drive', origem: nomes.join(' · '), pastaRadsUrl: pastaRads && pastaRads.getUrl(), pastaNotasUrl: pastaNotas && pastaNotas.getUrl(),
    atualizadoEm: agora, rads: rads, pdfs: pdfs, ignorados: ignorados
  };
}

/**
 * Lê um arquivo de RAD. Aceita:
 *  - .xls exportado do sistema (na verdade é HTML) -> { html }
 *  - planilha Excel (.xlsx/.xls) ou Planilha Google, inclusive a consolidada "UNIAO RAD" -> { grade }
 * Devolve null se o arquivo não tiver a tabela do RAD.
 */
function lerRadArquivo_(arq, mime) {
  if (mime === MimeType.GOOGLE_SHEETS) return gradeDaPlanilha_(SpreadsheetApp.openById(arq.getId()));
  var blob = arq.getBlob();
  var b = blob.getBytes();
  var ehXlsx = b.length > 1 && b[0] === 0x50 && b[1] === 0x4B;               // "PK" (zip)
  var ehXlsBin = b.length > 1 && (b[0] & 0xFF) === 0xD0 && (b[1] & 0xFF) === 0xCF; // Excel 97-2003
  if (ehXlsx || ehXlsBin) {
    // Converte uma cópia temporária em Planilha Google só para ler, e apaga em seguida.
    var tmp = Drive.Files.create({ name: '_tmp_rad_' + arq.getName(), mimeType: MimeType.GOOGLE_SHEETS }, blob, { fields: 'id' });
    try { return gradeDaPlanilha_(SpreadsheetApp.openById(tmp.id)); }
    finally { DriveApp.getFileById(tmp.id).setTrashed(true); }
  }
  var html = blob.getDataAsString('UTF-8');
  if (/title-rad|Sint(&eacute;|é)tico da Despesa|<table/i.test(html) && /Placa/i.test(html)) return { html: html };
  return null;
}

/** Procura a aba com a tabela do RAD (cabeçalho "Placa"); prefere a aba ABA_DADOS. */
function gradeDaPlanilha_(ss) {
  var tz = Session.getScriptTimeZone();
  var abas = ss.getSheets().slice().sort(function (a) { return a.getName() === ABA_DADOS ? -1 : 1; });
  for (var i = 0; i < abas.length; i++) {
    var v = abas[i].getDataRange().getValues();
    var temCab = v.slice(0, 30).some(function (l) { return /^placa$/i.test(String(l[0]).trim()); });
    if (!temCab) continue;
    return {
      aba: abas[i].getName(),
      grade: v.map(function (l) {
        return l.map(function (x) { return x instanceof Date ? Utilities.formatDate(x, tz, 'dd/MM/yyyy HH:mm') : x; });
      })
    };
  }
  return null;
}

function listarArquivos_(pasta, caminho, cb) {
  var arqs = pasta.getFiles();
  while (arqs.hasNext()) cb(arqs.next(), caminho);
  var subs = pasta.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    if (s.getName() === PASTA_ZIP) continue;
    listarArquivos_(s, caminho + s.getName() + '/', cb);
  }
}

/* ------------------------------------------------------------------ */
/* Leitura do texto dos PDFs (OCR do Drive) com cache                  */
/* ------------------------------------------------------------------ */

/**
 * Chamado pelo painel com uma lista de IDs de PDF. Extrai o texto de cada um até o limite de tempo
 * e devolve { textos: {id: texto}, pendentes: [ids não processados] }.
 */
function lerTextosPdf(ids) {
  var inicio = Date.now();
  var cache = lerCache_();
  var textos = {}, pendentes = [], erros = {};
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if ((Date.now() - inicio) / 1000 > LIMITE_SEGUNDOS) { pendentes = ids.slice(i); break; }
    try {
      var arq = DriveApp.getFileById(id);
      var atualizado = arq.getLastUpdated().getTime();
      if (cache[id] && cache[id].atualizado === atualizado) { textos[id] = cache[id].texto; continue; }
      var texto = extrairTexto_(arq);
      textos[id] = texto;
      gravarCache_(id, atualizado, texto);
    } catch (e) {
      erros[id] = String(e && e.message || e);
      textos[id] = '';
    }
  }
  return { textos: textos, pendentes: pendentes, erros: erros };
}

/** Converte o PDF em Google Docs (com OCR) só para ler o texto, e apaga a cópia em seguida. */
function extrairTexto_(arq) {
  var doc = Drive.Files.create(
    { name: '_ocr_tmp_' + arq.getName(), mimeType: 'application/vnd.google-apps.document' },
    arq.getBlob(),
    { ocrLanguage: 'pt', fields: 'id' }
  );
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    DriveApp.getFileById(doc.id).setTrashed(true);
  }
}

function abaCache_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_CACHE);
  if (!aba) {
    aba = ss.insertSheet(ABA_CACHE);
    aba.getRange(1, 1, 1, 3).setValues([['id', 'atualizado', 'texto']]);
    aba.hideSheet();
  }
  return aba;
}

function lerCache_() {
  var aba = abaCache_();
  var n = aba.getLastRow();
  var mapa = {};
  if (n < 2) return mapa;
  aba.getRange(2, 1, n - 1, 3).getValues().forEach(function (l, i) {
    mapa[l[0]] = { atualizado: Number(l[1]), texto: String(l[2]), linha: i + 2 };
  });
  return mapa;
}

function gravarCache_(id, atualizado, texto) {
  var aba = abaCache_();
  texto = String(texto || '').slice(0, 45000); // limite de 50 mil caracteres por célula
  var ids = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) { aba.getRange(i + 2, 2, 1, 2).setValues([[atualizado, texto]]); return; }
  }
  aba.appendRow([id, atualizado, texto]);
}

/* ------------------------------------------------------------------ */
/* Download das notas em ZIP                                           */
/* ------------------------------------------------------------------ */

/**
 * Junta os PDFs num .zip. Até ~8 MB devolve o arquivo direto (base64) para o navegador baixar;
 * acima disso salva o .zip na subpasta PASTA_ZIP e devolve o link.
 */
function gerarZip(itens, nomeZip) {
  var usados = {};
  var blobs = itens.map(function (it) {
    var blob = DriveApp.getFileById(it.id).getBlob();
    var nome = (it.nome || blob.getName()).replace(/[\\/:*?"<>|]/g, '_');
    if (usados[nome]) nome = nome.replace(/(\.pdf)?$/i, '_' + (++usados[nome]) + '.pdf'); else usados[nome] = 1;
    return blob.setName(nome);
  });
  var zip = Utilities.zip(blobs, nomeZip);
  var bytes = zip.getBytes();
  if (bytes.length < 8 * 1024 * 1024) return { nome: nomeZip, base64: Utilities.base64Encode(bytes) };

  var pasta = abrirPasta_(idsPastas_().notas, 'notas');
  var destinos = pasta.getFoldersByName(PASTA_ZIP);
  var destino = destinos.hasNext() ? destinos.next() : pasta.createFolder(PASTA_ZIP);
  var arq = destino.createFile(zip);
  return { nome: nomeZip, url: 'https://drive.google.com/uc?export=download&id=' + arq.getId(), driveUrl: arq.getUrl() };
}

/* ------------------------------------------------------------------ */
/* Modo planilha (sem pasta configurada)                               */
/* ------------------------------------------------------------------ */

function obterAba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_DADOS);
  if (aba) return aba;
  var abas = ss.getSheets();
  for (var i = 0; i < abas.length; i++) {
    var h = abas[i].getRange(1, 1, 1, Math.max(1, abas[i].getLastColumn())).getValues()[0];
    if (String(h[0]).trim().toLowerCase() === 'placa') return abas[i];
  }
  throw new Error('Nenhuma pasta do Drive configurada e a aba de dados não foi encontrada. Configure a pasta no painel.');
}

/** Informa ao painel quais pastas estão configuradas. */
function getConfig() {
  var ids = idsPastas_();
  var info = function (id) {
    try { var p = DriveApp.getFolderById(id); return { id: id, nome: p.getName(), url: p.getUrl() }; }
    catch (e) { return { id: id, nome: '', url: 'https://drive.google.com/drive/folders/' + id, erro: 'sem acesso' }; }
  };
  return { rads: info(ids.rads), notas: info(ids.notas) };
}
