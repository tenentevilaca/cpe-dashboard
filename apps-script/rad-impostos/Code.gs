/**
 * Painel de Impostos — RAD
 *
 * Fontes de dados (nesta ordem):
 *  1. Pastas do Google Drive (PASTA_RADS_PADRAO / PASTA_NOTAS_PADRAO ou as escolhidas no painel):
 *     - RADs: "Relatório Sintético da Despesa - RAD" (.xls exportados do sistema), um por unidade;
 *     - Notas: notas fiscais em PDF (inclusive em subpastas).
 *  2. Se as duas constantes estiverem vazias: a aba ABA_DADOS desta planilha.
 *
 * O texto dos PDFs é extraído pelo OCR do Google Drive (serviço avançado "Drive API") e reduzido a uma
 * "impressão digital" (números, CNPJs e valores encontrados), guardada na aba oculta "_cache_pdf_v2".
 *
 * Economia de dados: o RAD é convertido em tabela no servidor, e o painel recebe só os números das notas
 * que interessam (nunca o texto inteiro dos PDFs). O .zip é gravado no Drive e baixado direto de lá.
 */

// Pastas do Google Drive (podem ser trocadas pelo botão "📁 Pastas do Drive" no painel).
var PASTA_RADS_PADRAO = '1K1jNXFhsz2rCxjT8qAEIm2uodP8NruVt';   // RADs de cada unidade
var PASTA_NOTAS_PADRAO = '1ylX_cDzvczSj3wxz2fNKYUMfdngg5aBm';  // PDFs das notas fiscais

// Arquivos de RAD que NÃO devem ser lidos: a "UNIAO RAD" é só a junção dos RADs das unidades.
var IGNORAR_RADS = /uni[aã]o[\s_-]*rad/i;

var ABA_DADOS = 'BADE SE DADOS';
var ABA_CACHE = '_cache_pdf_v2';
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
  PropertiesService.getScriptProperties().setProperty('PASTAS_V2', JSON.stringify(cfg));
  return getConfig();
}

function idsPastas_() {
  var cfg = {};
  try { cfg = JSON.parse(PropertiesService.getScriptProperties().getProperty('PASTAS_V2') || '{}'); } catch (e) {}
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
  var rads = [], pdfs = [], vistos = {}, ignorados = [], consolidados = [];
  var cache = lerCache_();

  var tratar = function (arq, caminho) {
    var id = arq.getId();
    if (vistos[id]) return;
    vistos[id] = 1;
    var nome = arq.getName();
    var mime = arq.getMimeType();
    if (mime === MimeType.PDF || /\.pdf$/i.test(nome)) {
      var c = cache[id];
      // "lido": já tem impressão no cache (o painel busca só os números que precisa com impressoesCache).
      pdfs.push({ id: id, nome: nome, caminho: caminho, lido: !!(c && c.atualizado === arq.getLastUpdated().getTime()) });
    } else if (IGNORAR_RADS.test(nome)) {
      consolidados.push(caminho + nome); // planilha consolidada: os dados já estão nos RADs das unidades
    } else if (mime === MimeType.GOOGLE_SHEETS || mime === MimeType.MICROSOFT_EXCEL || mime === MimeType.MICROSOFT_EXCEL_LEGACY ||
               /\.(xlsx|xlsm|xls|html?)$/i.test(nome) || /rad/i.test(nome)) {
      try {
        var rad = lerRadArquivo_(arq, mime);
        if (rad) { rad.nome = caminho + nome; rads.push(rad); }
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
    modo: 'drive', origem: nomes.join(' · '), atualizadoEm: agora, rads: rads, pdfs: pdfs, ignorados: ignorados, consolidados: consolidados
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
  if (/title-rad|Sint(&eacute;|é)tico da Despesa|<table/i.test(html) && /Placa/i.test(html)) return { grade: gradeDoHtml_(html) };
  return null;
}

/** Converte as tabelas do RAD (HTML) em linhas de células de texto — bem menor que o HTML original. */
function gradeDoHtml_(html) {
  html = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
  var grade = [];
  (html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || []).forEach(function (tr) {
    var cels = (tr.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi) || []).map(function (td) {
      return decodificar_(td.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    });
    if (cels.some(String)) grade.push(cels);
  });
  return grade;
}

function decodificar_(s) {
  var marcas = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308', cedil: '\u0327' };
  var nomes = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', deg: '°' };
  return s.replace(/&([a-zA-Z])(acute|grave|circ|tilde|uml|cedil);/g, function (_, l, m) { return (l + marcas[m]).normalize('NFC'); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
    .replace(/&([a-z]+);/gi, function (m, n) { return nomes.hasOwnProperty(n.toLowerCase()) ? nomes[n.toLowerCase()] : m; });
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
 * Impressão digital do texto de uma nota: só o que serve para identificá-la.
 *  i: números inteiros "soltos" (nº da nota, OS…), sem zeros à esquerda
 *  j: sequências numéricas formatadas/longas, só dígitos (CNPJ, chave de acesso, datas…)
 *  v: valores em reais no formato 1.234,56
 *  tom: 1 se o texto diz que o ISSQN é retido pelo tomador
 *  len: tamanho do texto (0 = PDF sem texto legível)
 */
function impressao_(texto) {
  texto = String(texto || '');
  var i = {}, j = {}, v = {};
  (texto.match(/\d[\d.,\/\-]*\d|\d/g) || []).forEach(function (tok) {
    if (/^\d+$/.test(tok)) i[tok.replace(/^0+(?=\d)/, '')] = 1;
    else if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(tok)) v[tok] = 1;
    var d = tok.replace(/\D/g, '');
    if (d.length >= 6) j[d] = 1;
  });
  var n = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return {
    i: Object.keys(i), j: Object.keys(j), v: Object.keys(v),
    tom: /retido pelo tomador|iss(qn)? retido.{0,40}sim|tomador.{0,30}respons/.test(n) ? 1 : 0,
    len: texto.replace(/\s/g, '').length
  };
}

/**
 * Reduz a impressão ao que o painel procura (chaves: {i: nºs de nota e OS, c: CNPJs, v: valores}).
 * Assim cada PDF ocupa poucos bytes na resposta.
 */
function filtrarImpressao_(fp, chaves) {
  var I = {}, V = {};
  (chaves.i || []).forEach(function (x) { I[x] = 1; });
  (chaves.v || []).forEach(function (x) { V[x] = 1; });
  var out = { i: fp.i.filter(function (x) { return I[x]; }), c: [], v: fp.v.filter(function (x) { return V[x]; }), tom: fp.tom, len: fp.len };
  (chaves.i || []).forEach(function (x) {
    if (x.length >= 6 && out.i.indexOf(x) < 0 && fp.j.some(function (t) { return t.indexOf(x) > -1; })) out.i.push(x);
  });
  (chaves.c || []).forEach(function (x) {
    if (fp.j.some(function (t) { return t.indexOf(x) > -1; })) out.c.push(x);
  });
  return out;
}

/** Chamado pelo painel: impressões já guardadas no cache, filtradas pelas chaves. */
function impressoesCache(ids, chaves) {
  var cache = lerCache_(), out = {};
  ids.forEach(function (id) { if (cache[id]) out[id] = filtrarImpressao_(cache[id].fp, chaves); });
  return out;
}

/**
 * Chamado pelo painel com um lote de IDs de PDF: lê cada um (OCR) até o limite de tempo.
 * Devolve { fps: {id: impressão filtrada}, pendentes: [ids não processados], erros: {id: msg} }.
 */
function lerImpressoesPdf(ids, chaves) {
  var inicio = Date.now();
  var cache = lerCache_();
  var fps = {}, pendentes = [], erros = {}, novos = [];
  for (var k = 0; k < ids.length; k++) {
    var id = ids[k];
    if ((Date.now() - inicio) / 1000 > LIMITE_SEGUNDOS) { pendentes = ids.slice(k); break; }
    try {
      var arq = DriveApp.getFileById(id);
      var atualizado = arq.getLastUpdated().getTime();
      var fp = cache[id] && cache[id].atualizado === atualizado ? cache[id].fp : null;
      if (!fp) { fp = impressao_(extrairTexto_(arq)); novos.push([id, atualizado, JSON.stringify(fp)]); }
      fps[id] = filtrarImpressao_(fp, chaves);
    } catch (e) {
      erros[id] = String(e && e.message || e);
      fps[id] = { i: [], c: [], v: [], tom: 0, len: 0 };
    }
  }
  gravarCache_(novos, cache);
  return { fps: fps, pendentes: pendentes, erros: erros };
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
    aba.getRange(1, 1, 1, 3).setValues([['id', 'atualizado', 'impressao']]);
    aba.hideSheet();
    var antiga = ss.getSheetByName('_cache_pdf'); // versão anterior guardava o texto inteiro
    if (antiga) ss.deleteSheet(antiga);
  }
  return aba;
}

function lerCache_() {
  var aba = abaCache_();
  var n = aba.getLastRow();
  var mapa = {};
  if (n < 2) return mapa;
  aba.getRange(2, 1, n - 1, 3).getValues().forEach(function (l, i) {
    try { mapa[l[0]] = { atualizado: Number(l[1]), fp: JSON.parse(l[2]), linha: i + 2 }; } catch (e) {}
  });
  return mapa;
}

/** Grava várias impressões de uma vez (atualiza as existentes e acrescenta as novas). */
function gravarCache_(linhas, cache) {
  if (!linhas.length) return;
  var aba = abaCache_(), novas = [];
  linhas.forEach(function (l) {
    var c = cache[l[0]];
    if (c && c.linha) aba.getRange(c.linha, 2, 1, 2).setValues([[l[1], l[2]]]);
    else novas.push(l);
  });
  if (novas.length) aba.getRange(aba.getLastRow() + 1, 1, novas.length, 3).setValues(novas);
}

/* ------------------------------------------------------------------ */
/* Download das notas em ZIP                                           */
/* ------------------------------------------------------------------ */

/**
 * Junta os PDFs (e a relação em CSV) num .zip gravado na subpasta PASTA_ZIP da pasta de notas.
 * O navegador baixa o arquivo direto do Drive, sem passar pelo painel (menos dados trafegados).
 * Os .zip gerados antes são enviados para a lixeira.
 */
function gerarZip(itens, nomeZip, csv) {
  var usados = {};
  var blobs = itens.map(function (it) {
    var blob = DriveApp.getFileById(it.id).getBlob();
    var nome = (it.nome || blob.getName()).replace(/[\\/:*?"<>|]/g, '_');
    if (usados[nome]) nome = nome.replace(/(\.pdf)?$/i, '_' + (++usados[nome]) + '.pdf'); else usados[nome] = 1;
    return blob.setName(nome);
  });
  if (csv) blobs.push(Utilities.newBlob(csv, 'text/csv', 'relacao_notas.csv'));
  var zip = Utilities.zip(blobs, nomeZip);

  var pasta = abrirPasta_(idsPastas_().notas, 'notas');
  var destinos = pasta.getFoldersByName(PASTA_ZIP);
  var destino = destinos.hasNext() ? destinos.next() : pasta.createFolder(PASTA_ZIP);
  var antigos = destino.getFiles();
  while (antigos.hasNext()) { var a = antigos.next(); if (/\.zip$/i.test(a.getName())) a.setTrashed(true); }
  var arq = destino.createFile(zip);
  return { nome: nomeZip, url: 'https://drive.google.com/uc?export=download&id=' + arq.getId(), tamanho: arq.getSize() };
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
