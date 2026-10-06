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
  try { lembrarPlanilha_(); } catch (e) {}
  SpreadsheetApp.getUi()
    .createMenu('📊 Painel de Impostos')
    .addItem('Abrir painel', 'abrirPainel')
    .addToUi();
}

function abrirPainel() {
  lembrarPlanilha_();
  // Quem chega aqui pelo menu é editor desta planilha: o painel já abre com uma sessão de gestor,
  // sem depender do e-mail da conta Google (que falha, p. ex., com várias contas abertas no navegador).
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) {}
  var token = novoToken_();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({
    login: 'planilha', nome_pm: email || 'Gestor (planilha)', perfil: 'GESTOR', planilha: true
  }), SESSAO_SEGUNDOS);
  var html = HtmlService.createHtmlOutputFromFile('Index').setWidth(1400).setHeight(900)
    .append('<script>window.TOKEN_INICIAL = ' + JSON.stringify(token) + ';</script>');
  SpreadsheetApp.getUi().showModelessDialog(html, 'Painel de Impostos — RAD');
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Pré-faturamento — RAD')
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
function salvarPastas(token, rads, notas) {
  exigirGestor_(token);
  var cfg = {};
  [['rads', rads], ['notas', notas]].forEach(function (par) {
    if (!String(par[1] || '').trim()) return;
    var id = idDaPasta_(par[1]);
    if (!id) throw new Error('Link de pasta inválido: ' + par[1]);
    DriveApp.getFolderById(id).getName(); // valida o acesso
    cfg[par[0]] = id;
  });
  PropertiesService.getScriptProperties().setProperty('PASTAS_V2', JSON.stringify(cfg));
  return getConfig(token);
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
function getFontes(token) {
  exigirGestor_(token);
  var tz = Session.getScriptTimeZone();
  var agora = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
  var ids = idsPastas_();

  if (!ids.rads && !ids.notas) {
    var aba = obterAba_();
    var valores = aba.getDataRange().getValues().map(function (l) {
      return l.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'dd/MM/yyyy HH:mm') : v; });
    });
    return {
      modo: 'planilha', origem: painelSS_().getName() + ' · aba “' + aba.getName() + '”',
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
function impressoesCache(token, ids, chaves) {
  exigirGestor_(token);
  var cache = lerCache_(), out = {};
  ids.forEach(function (id) { if (cache[id]) out[id] = filtrarImpressao_(cache[id].fp, chaves); });
  return out;
}

/**
 * Chamado pelo painel com um lote de IDs de PDF: lê cada um (OCR) até o limite de tempo.
 * Devolve { fps: {id: impressão filtrada}, pendentes: [ids não processados], erros: {id: msg} }.
 */
function lerImpressoesPdf(token, ids, chaves) {
  exigirGestor_(token);
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
  var ss = painelSS_();
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
function gerarZip(token, itens, nomeZip, csv) {
  exigirGestor_(token);
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
  var ss = painelSS_();
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
function getConfig(token) {
  exigirGestor_(token);
  var ids = idsPastas_();
  var info = function (id) {
    try { var p = DriveApp.getFolderById(id); return { id: id, nome: p.getName(), url: p.getUrl() }; }
    catch (e) { return { id: id, nome: '', url: 'https://drive.google.com/drive/folders/' + id, erro: 'sem acesso' }; }
  };
  return { rads: info(ids.rads), notas: info(ids.notas) };
}

/* ------------------------------------------------------------------ */
/* Pré-faturamento: painel da planilha de verificação                  */
/* ------------------------------------------------------------------ */

// Planilha e aba do pré-faturamento (link: .../spreadsheets/d/<ID>/edit?gid=<GID>).
var PREFAT_PLANILHA_ID = '1e_3NDsYYtxpRXZhoHpY7a4GZLcq9IxN-goOd4boonmU';
var PREFAT_ABA_GID = 734096426;

// Colunas editáveis no painel (comparadas pelo nome do cabeçalho, sem acento e sem maiúsculas).
var PREFAT_COLUNAS = [
  { tipo: 'lista', teste: /^ultima verif/ },
  { tipo: 'data', teste: /^data (da )?verif/ },
  { tipo: 'lista', teste: /^verificac/ },
  { tipo: 'texto', teste: /^obs/ }
];

function normPrefat_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function abrirPrefat_() {
  var ss;
  try { ss = SpreadsheetApp.openById(PREFAT_PLANILHA_ID); }
  catch (e) {
    var mime = '';
    try { mime = DriveApp.getFileById(PREFAT_PLANILHA_ID).getMimeType(); } catch (e2) {}
    if (mime && mime !== MimeType.GOOGLE_SHEETS) {
      throw new Error('A planilha de pré-faturamento está em formato Excel (.xlsx) e não pode ser editada pelo painel. ' +
        'Abra-a e use Arquivo › Salvar como Planilhas Google; depois troque PREFAT_PLANILHA_ID no Code.gs pelo ID da nova planilha.');
    }
    throw new Error('Sem acesso à planilha de pré-faturamento (' + PREFAT_PLANILHA_ID + '): ' + (e && e.message || e));
  }
  var abas = ss.getSheets(), aba = null;
  for (var i = 0; i < abas.length && !aba; i++) if (abas[i].getSheetId() === PREFAT_ABA_GID) aba = abas[i];
  // Se o gid mudou (ex.: planilha convertida), usa a aba que tem as colunas de verificação.
  for (var k = 0; k < abas.length && !aba; k++) {
    var topo = abas[k].getRange(1, 1, Math.min(15, Math.max(1, abas[k].getLastRow())), Math.max(1, abas[k].getLastColumn())).getDisplayValues();
    if (topo.some(function (l) { return l.some(function (c) { return /^verificac/.test(normPrefat_(c)); }); })) aba = abas[k];
  }
  if (!aba) aba = abas[0];
  return { ss: ss, aba: aba };
}

function cabecalhoPrefat_(valores) {
  for (var r = 0; r < Math.min(15, valores.length); r++) {
    var l = valores[r].map(normPrefat_);
    if (l.some(function (c) { return /^verificac|^obs/.test(c); })) return r;
  }
  for (var q = 0; q < valores.length; q++) if (valores[q].filter(String).length >= 3) return q;
  return 0;
}

function editaveisPrefat_(cab) {
  var out = [];
  cab.forEach(function (c, i) {
    var n = normPrefat_(c);
    for (var k = 0; k < PREFAT_COLUNAS.length; k++) {
      if (PREFAT_COLUNAS[k].teste.test(n)) { out.push({ col: i, tipo: PREFAT_COLUNAS[k].tipo }); break; }
    }
  });
  return out;
}

/** Opções da lista suspensa: a validação de dados da coluna (se houver) + valores já usados. */
function opcoesPrefat_(aba, colPlanilha, linhaIni, nLinhas, valoresColuna) {
  var ops = [];
  var regra = nLinhas > 0 ? aba.getRange(linhaIni, colPlanilha).getDataValidation() : null;
  if (regra) {
    var tipo = regra.getCriteriaType(), args = regra.getCriteriaValues();
    if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) ops = args[0].slice();
    else if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
      ops = args[0].getDisplayValues().reduce(function (a, l) { return a.concat(l); }, []);
    }
  }
  valoresColuna.forEach(function (v) { if (v !== '' && ops.indexOf(v) < 0) ops.push(v); });
  return ops.filter(function (v, i, a) { return v !== '' && a.indexOf(v) === i; });
}

/** Chamado pelo painel: dados da aba de pré-faturamento (só textos exibidos, para trafegar menos). */
function getPrefat(token) {
  exigirGestor_(token);
  var p = abrirPrefat_(), aba = p.aba;
  garantirColunaResposta_(aba);
  var valores = aba.getDataRange().getDisplayValues();
  var h = cabecalhoPrefat_(valores);
  var cab = valores[h] || [];
  var linhas = valores.slice(h + 1);
  while (linhas.length && !linhas[linhas.length - 1].some(String)) linhas.pop();
  var linhaIni = h + 2; // número da 1ª linha de dados na planilha
  var editaveis = editaveisPrefat_(cab);
  editaveis.forEach(function (e) {
    if (e.tipo === 'texto') return;
    e.opcoes = opcoesPrefat_(aba, e.col + 1, linhaIni, linhas.length, linhas.map(function (l) { return l[e.col]; }));
  });
  return {
    planilha: p.ss.getName(), aba: aba.getName(), url: p.ss.getUrl() + '#gid=' + aba.getSheetId(),
    cab: cab, linhas: linhas, linhaIni: linhaIni, editaveis: editaveis, colResposta: colunaPorNome_(cab, /^resposta/),
    atualizadoEm: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
  };
}

/**
 * Chamado pelo painel: grava uma célula editável.
 * "anterior" é o valor que o painel mostrava; se alguém mudou a célula nesse meio tempo, não sobrescreve.
 * Valor novo numa coluna com lista suspensa é acrescentado às opções da validação.
 */
function salvarPrefat(token, linha, col, valor, anterior) {
  exigirGestor_(token);
  var aba = abrirPrefat_().aba;
  var topo = aba.getRange(1, 1, Math.min(15, Math.max(1, aba.getLastRow())), Math.max(1, aba.getLastColumn())).getDisplayValues();
  var hPos = cabecalhoPrefat_(topo);
  var linhaIni = hPos + 2;
  if (linha < linhaIni) throw new Error('Linha inválida.');
  if (!editaveisPrefat_(topo[hPos]).some(function (e) { return e.col === col; })) throw new Error('Esta coluna não pode ser alterada pelo painel.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var cel = aba.getRange(linha, col + 1);
    var atual = cel.getDisplayValue();
    if (anterior != null && atual !== anterior) return { conflito: true, atual: atual };
    var regra = cel.getDataValidation();
    if (valor !== '' && regra && regra.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      var ops = regra.getCriteriaValues()[0];
      if (ops.indexOf(valor) < 0) {
        var nova = regra.copy().requireValueInList(ops.concat([valor]), regra.getCriteriaValues()[1] !== false).build();
        var faixa = aba.getRange(linhaIni, col + 1, Math.max(1, aba.getMaxRows() - linhaIni + 1), 1);
        faixa.setDataValidation(nova);
      }
    }
    cel.setValue(valor);
    SpreadsheetApp.flush();
    return { ok: true, valor: cel.getDisplayValue() };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Acesso: gestores e usuários (login próprio)                         */
/* ------------------------------------------------------------------ */
/*
 * Gestor:   quem abre o painel pelo menu da planilha (editor desta planilha), o dono do script ao abrir o
 *           App da Web logado na conta Google, os e-mails em GESTORES_EMAILS, ou um login com perfil GESTOR.
 * Usuário:  PM que se cadastra (Nome PM, Cia, Unidade, login e senha) e é aprovado pelo gestor.
 *           Vê só as linhas da sua Unidade/Cia, sem alterar nada, e pode escrever na coluna RESPOSTA.
 * Os cadastros ficam na aba oculta "_usuarios" desta planilha (senha guardada só como hash com sal).
 */

var GESTORES_EMAILS = [];            // e-mails Google com acesso de gestor (além dos editores desta planilha)
var ABA_USUARIOS = '_usuarios';
var SESSAO_SEGUNDOS = 6 * 60 * 60;   // sessão de login vale 6 horas
var USU_CAB = ['login', 'nome_pm', 'cia', 'unidade', 'hash', 'sal', 'status', 'perfil', 'solicitado_em', 'decidido_em', 'decidido_por', 'ultimo_acesso'];

function agora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }

function abaUsuarios_() {
  var ss = painelSS_();
  var aba = ss.getSheetByName(ABA_USUARIOS);
  if (!aba) {
    aba = ss.insertSheet(ABA_USUARIOS);
    aba.getRange(1, 1, 1, USU_CAB.length).setValues([USU_CAB]);
    aba.hideSheet();
  }
  return aba;
}

/** Guarda o ID desta planilha para o App da Web (que roda sem planilha "ativa"). */
/** Planilha do painel (onde ficam as abas ocultas de cache e usuários), também no App da Web. */
function painelSS_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('PAINEL_SS_ID');
  if (!id) throw new Error('Abra o painel uma vez pelo menu da planilha (📊 Painel de Impostos) para concluir a configuração.');
  return SpreadsheetApp.openById(id);
}

function lembrarPlanilha_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getScriptProperties().setProperty('PAINEL_SS_ID', ss.getId());
}

function lerUsuarios_() {
  var aba = abaUsuarios_(), n = aba.getLastRow();
  if (n < 2) return [];
  return aba.getRange(2, 1, n - 1, USU_CAB.length).getValues().map(function (l, i) {
    var u = { linha: i + 2 };
    USU_CAB.forEach(function (c, k) { u[c] = String(l[k] == null ? '' : l[k]); });
    return u;
  });
}

function gravarUsuario_(u) {
  var aba = abaUsuarios_();
  var linha = USU_CAB.map(function (c) { return u[c] == null ? '' : u[c]; });
  if (u.linha) aba.getRange(u.linha, 1, 1, USU_CAB.length).setValues([linha]);
  else aba.appendRow(linha);
}

function normLogin_(s) { return String(s || '').trim().toLowerCase(); }

function hashSenha_(senha, sal) {
  var h = sal + '|' + senha;
  for (var i = 0; i < 300; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + sal, Utilities.Charset.UTF_8));
  }
  return h;
}

function novoToken_() {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Math.random() + Date.now(), Utilities.Charset.UTF_8)).replace(/=+$/, '');
}

function sessao_(token) {
  if (!token) return null;
  var v = CacheService.getScriptCache().get('sess_' + token);
  return v ? JSON.parse(v) : null;
}

/** Gestor pela conta Google (menu da planilha / dono do App da Web) ou por login com perfil GESTOR. */
function gestorGoogle_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) {}
  if (!email) return '';
  var dono = '';
  try { dono = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (email === dono || GESTORES_EMAILS.indexOf(email) > -1) return email;
  return '';
}

function exigirGestor_(token) {
  if (gestorGoogle_()) return { perfil: 'GESTOR', nome: gestorGoogle_() };
  var s = sessao_(token);
  if (s && s.perfil === 'GESTOR') return s;
  throw new Error('Acesso restrito à gestão. Entre com um login de gestor.');
}

function exigirUsuario_(token) {
  var s = sessao_(token);
  if (!s) throw new Error('Sessão expirada. Entre novamente.');
  return s;
}

/** Chamado ao abrir o painel: quem está acessando. */
function getSessao(token) {
  lembrarPlanilha_();
  var g = gestorGoogle_();
  if (g) return { perfil: 'GESTOR', nome: g, google: true };
  var s = sessao_(token);
  return s ? { perfil: s.perfil, nome: s.nome_pm, unidade: s.unidade, cia: s.cia, google: !!s.planilha } : null;
}

/** Opções de Unidade e Cia para o formulário de cadastro (tiradas da planilha de pré-faturamento). */
function getOpcoesCadastro() {
  var o = { unidades: [], cias: [] };
  try {
    var aba = abrirPrefat_().aba;
    var v = aba.getDataRange().getDisplayValues(), h = cabecalhoPrefat_(v), cab = v[h];
    var cu = colunaPorNome_(cab, /^unidade/), cc = colunaPorNome_(cab, /^cia\b|^companhia/);
    var uniq = function (c) {
      if (c < 0) return [];
      return v.slice(h + 1).map(function (l) { return String(l[c]).trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort();
    };
    o.unidades = uniq(cu); o.cias = uniq(cc);
  } catch (e) {}
  return o;
}

/** Pedido de acesso do PM. Fica PENDENTE até o gestor aprovar. */
function solicitarAcesso(dados) {
  var login = normLogin_(dados.login), nome = String(dados.nome || '').trim();
  var cia = String(dados.cia || '').trim(), unidade = String(dados.unidade || '').trim(), senha = String(dados.senha || '');
  if (!/^[a-z0-9._@-]{3,60}$/.test(login)) throw new Error('Login inválido: use de 3 a 60 letras, números, ponto, hífen ou @.');
  if (nome.length < 3) throw new Error('Informe o nome PM.');
  if (!unidade) throw new Error('Informe a Unidade.');
  if (!cia) throw new Error('Informe a Cia.');
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (lerUsuarios_().some(function (u) { return u.login === login; })) throw new Error('Este login já existe. Escolha outro ou fale com o gestor.');
    var sal = novoToken_().slice(0, 16);
    gravarUsuario_({ login: login, nome_pm: nome, cia: cia, unidade: unidade, hash: hashSenha_(senha, sal), sal: sal,
                     status: 'PENDENTE', perfil: 'USUARIO', solicitado_em: agora_() });
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function entrar(login, senha) {
  login = normLogin_(login);
  var cache = CacheService.getScriptCache(), kt = 'tent_' + login;
  var tent = Number(cache.get(kt) || 0);
  if (tent >= 5) throw new Error('Muitas tentativas. Aguarde 10 minutos.');
  var u = lerUsuarios_().filter(function (x) { return x.login === login; })[0];
  if (!u || hashSenha_(String(senha || ''), u.sal) !== u.hash) {
    cache.put(kt, String(tent + 1), 600);
    throw new Error('Login ou senha incorretos.');
  }
  cache.remove(kt);
  if (u.status === 'PENDENTE') throw new Error('Seu cadastro ainda aguarda aprovação do gestor.');
  if (u.status !== 'APROVADO') throw new Error('Acesso ' + u.status.toLowerCase() + '. Fale com o gestor.');
  var token = novoToken_();
  var sess = { login: u.login, nome_pm: u.nome_pm, cia: u.cia, unidade: u.unidade, perfil: u.perfil || 'USUARIO' };
  cache.put('sess_' + token, JSON.stringify(sess), SESSAO_SEGUNDOS);
  u.ultimo_acesso = agora_(); gravarUsuario_(u);
  return { token: token, perfil: sess.perfil, nome: u.nome_pm, unidade: u.unidade, cia: u.cia };
}

function sair(token) { if (token) CacheService.getScriptCache().remove('sess_' + token); return true; }

function trocarSenha(token, atual, nova) {
  var s = exigirUsuario_(token);
  if (String(nova || '').length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
  var u = lerUsuarios_().filter(function (x) { return x.login === s.login; })[0];
  if (!u || hashSenha_(String(atual || ''), u.sal) !== u.hash) throw new Error('Senha atual incorreta.');
  u.sal = novoToken_().slice(0, 16); u.hash = hashSenha_(nova, u.sal); gravarUsuario_(u);
  return { ok: true };
}

/* ---- Gestão de acessos ---- */

function listarUsuarios(token) {
  exigirGestor_(token);
  return lerUsuarios_().map(function (u) {
    return { login: u.login, nome: u.nome_pm, cia: u.cia, unidade: u.unidade, status: u.status, perfil: u.perfil,
             solicitado: u.solicitado_em, decidido: u.decidido_em, por: u.decidido_por, acesso: u.ultimo_acesso };
  });
}

/** acao: APROVAR | RECUSAR | BLOQUEAR | REATIVAR | SALVAR (unidade/cia/perfil) | SENHA (gera senha temporária). */
function decidirUsuario(token, login, acao, dados) {
  var g = exigirGestor_(token);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var u = lerUsuarios_().filter(function (x) { return x.login === normLogin_(login); })[0];
    if (!u) throw new Error('Usuário não encontrado.');
    dados = dados || {};
    if (dados.unidade != null) u.unidade = String(dados.unidade).trim();
    if (dados.cia != null) u.cia = String(dados.cia).trim();
    if (dados.perfil === 'GESTOR' || dados.perfil === 'USUARIO') u.perfil = dados.perfil;
    var resp = { ok: true };
    if (acao === 'APROVAR' || acao === 'REATIVAR') u.status = 'APROVADO';
    else if (acao === 'RECUSAR') u.status = 'RECUSADO';
    else if (acao === 'BLOQUEAR') u.status = 'BLOQUEADO';
    else if (acao === 'SENHA') {
      var temp = novoToken_().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
      u.sal = novoToken_().slice(0, 16); u.hash = hashSenha_(temp, u.sal); resp.senhaTemporaria = temp;
    }
    if (acao !== 'SALVAR' && acao !== 'SENHA') { u.decidido_em = agora_(); u.decidido_por = g.nome || g.nome_pm || g.login || ''; }
    gravarUsuario_(u);
    return resp;
  } finally { lock.releaseLock(); }
}

/* ---- Visão do usuário (somente leitura + RESPOSTA) ---- */

function colunaPorNome_(cab, re) {
  for (var i = 0; i < cab.length; i++) if (re.test(normPrefat_(cab[i]))) return i;
  return -1;
}

/** Cria a coluna RESPOSTA no fim do cabeçalho, se ainda não existir. */
function garantirColunaResposta_(aba) {
  var topo = aba.getRange(1, 1, Math.min(15, Math.max(1, aba.getLastRow())), Math.max(1, aba.getLastColumn())).getDisplayValues();
  var h = cabecalhoPrefat_(topo);
  if (colunaPorNome_(topo[h], /^resposta/) > -1) return;
  var ult = topo[h].length;
  while (ult > 0 && !String(topo[h][ult - 1]).trim()) ult--;
  aba.getRange(h + 1, ult + 1).setValue('RESPOSTA').setFontWeight('bold');
}

function mesmaChave_(a, b) { return normPrefat_(a).replace(/[^a-z0-9]/g, '') === normPrefat_(b).replace(/[^a-z0-9]/g, ''); }

/** Linhas da Unidade/Cia do usuário. Devolve só o necessário para a consulta. */
function getMinhasNotas(token) {
  var s = exigirUsuario_(token);
  var aba = abrirPrefat_().aba;
  garantirColunaResposta_(aba);
  var v = aba.getDataRange().getDisplayValues(), h = cabecalhoPrefat_(v), cab = v[h];
  var cu = colunaPorNome_(cab, /^unidade/), cc = colunaPorNome_(cab, /^cia\b|^companhia/);
  if (cu < 0) throw new Error('A planilha de pré-faturamento não tem a coluna UNIDADE.');
  var cr = colunaPorNome_(cab, /^resposta/);
  var linhas = [];
  for (var r = h + 1; r < v.length; r++) {
    var l = v[r];
    if (!l.some(String)) continue;
    if (!mesmaChave_(l[cu], s.unidade)) continue;
    if (cc > -1 && !mesmaChave_(l[cc], s.cia)) continue;
    linhas.push({ linha: r + 1, v: l });
  }
  return {
    cab: cab, linhas: linhas, colResposta: cr, colStatus: colunaPorNome_(cab, /^verificac/), colObs: colunaPorNome_(cab, /^obs/),
    filtroCia: cc > -1, unidade: s.unidade, cia: s.cia, nome: s.nome_pm, atualizadoEm: agora_()
  };
}

/** O usuário só pode gravar a RESPOSTA, e só numa linha da sua Unidade/Cia. */
function responder(token, linha, texto, anterior) {
  var s = exigirUsuario_(token);
  var aba = abrirPrefat_().aba;
  var topo = aba.getRange(1, 1, Math.min(15, Math.max(1, aba.getLastRow())), Math.max(1, aba.getLastColumn())).getDisplayValues();
  var h = cabecalhoPrefat_(topo), cab = topo[h];
  var cu = colunaPorNome_(cab, /^unidade/), cc = colunaPorNome_(cab, /^cia\b|^companhia/), cr = colunaPorNome_(cab, /^resposta/);
  if (cr < 0 || linha <= h + 1) throw new Error('Linha inválida.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var l = aba.getRange(linha, 1, 1, cab.length).getDisplayValues()[0];
    if (!mesmaChave_(l[cu], s.unidade) || (cc > -1 && !mesmaChave_(l[cc], s.cia))) throw new Error('Sem permissão para esta linha.');
    var cel = aba.getRange(linha, cr + 1);
    if (anterior != null && cel.getDisplayValue() !== anterior) return { conflito: true, atual: cel.getDisplayValue() };
    texto = String(texto || '').slice(0, 2000);
    cel.setValue(texto);
    cel.setNote(texto ? 'Respondido por ' + s.nome_pm + ' (' + s.login + ') em ' + agora_() : '');
    return { ok: true, valor: cel.getDisplayValue() };
  } finally { lock.releaseLock(); }
}
