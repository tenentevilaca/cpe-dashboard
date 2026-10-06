/**
 * Painel de Impostos — RAD
 *
 * Fontes de dados (nesta ordem):
 *  1. Pastas do Google Drive, descobertas a partir de PASTA_RAIZ (ou a raiz escolhida no painel):
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
// Pasta raiz no Drive. Dentro dela o script localiza sozinho (pelos nomes):
//  - a pasta dos RADs (nome com "RAD"), a pasta das notas (nome com "NOTA", "NF" ou "FISCA")
//  - e a planilha de pré-faturamento (Planilha Google com "FATUR" no nome).
// Se não achar uma pasta específica, usa a raiz inteira (com todas as subpastas).
var PASTA_RAIZ = '1LVWFCLeEDHZ6np-GlUoTana73Hqz1ZLQ';

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

/** Chamado pelo painel: troca a pasta raiz (link ou ID) e refaz a descoberta. Vazio = raiz padrão (PASTA_RAIZ). */
function salvarPastas(token, raiz) {
  exigirGestor_(token);
  var props = PropertiesService.getScriptProperties();
  if (String(raiz || '').trim()) {
    var id = idDaPasta_(raiz);
    if (!id) throw new Error('Link de pasta inválido: ' + raiz);
    DriveApp.getFolderById(id).getName(); // valida o acesso
    props.setProperty('RAIZ_ID', id);
  } else props.deleteProperty('RAIZ_ID');
  props.deleteProperty('DESCOBERTA');
  descobrir_(true);
  return getConfig(token);
}

function raizId_() { return PropertiesService.getScriptProperties().getProperty('RAIZ_ID') || PASTA_RAIZ; }

/**
 * Procura, dentro da raiz (até 4 níveis), a pasta de RADs, a pasta de notas e a planilha de pré-faturamento.
 * O resultado fica guardado (propriedades do script) e é refeito quando a raiz muda ou em "Pastas do Drive".
 */
function descobrir_(forcar) {
  var props = PropertiesService.getScriptProperties();
  var raiz = raizId_();
  if (!forcar) {
    try {
      var d0 = JSON.parse(props.getProperty('DESCOBERTA') || 'null');
      if (d0 && d0.raiz === raiz && Date.now() - (d0.em || 0) < 6 * 3600 * 1000) return d0;
    } catch (e) {}
  }
  var pastaRaiz = abrirPasta_(raiz, 'raiz');
  var achado = { raiz: raiz, rads: '', notas: '', prefat: '', prefatXlsx: '', em: Date.now() };
  var nivel = [{ p: pastaRaiz, prof: 0 }];
  while (nivel.length) {
    var prox = [];
    nivel.forEach(function (it) {
      var n = normPrefat_(it.p.getName());
      if (it.prof > 0) {
        if (!achado.rads && /(^|[^a-z])rads?([^a-z]|$)/.test(n) && !/uniao/.test(n)) achado.rads = it.p.getId();
        if (!achado.notas && /nota|(^|[^a-z])nfs?e?([^a-z]|$)|fisca/.test(n)) achado.notas = it.p.getId();
      }
      if (!achado.prefat) {
        var planilhas = it.p.getFilesByType(MimeType.GOOGLE_SHEETS);
        while (planilhas.hasNext()) {
          var f = planilhas.next();
          if (/fatur/.test(normPrefat_(f.getName()))) { achado.prefat = f.getId(); break; }
        }
      }
      if (!achado.prefat && !achado.prefatXlsx) {
        var outros = it.p.getFiles();
        while (outros.hasNext()) {
          var g = outros.next();
          if (/fatur/.test(normPrefat_(g.getName())) && /\.xls/i.test(g.getName())) { achado.prefatXlsx = g.getName(); break; }
        }
      }
      if (it.prof < 4) {
        var subs = it.p.getFolders();
        while (subs.hasNext()) { var s2 = subs.next(); if (s2.getName() !== PASTA_ZIP) prox.push({ p: s2, prof: it.prof + 1 }); }
      }
    });
    nivel = prox;
  }
  props.setProperty('DESCOBERTA', JSON.stringify(achado));
  return achado;
}

function idsPastas_() {
  var d = descobrir_(false);
  return { rads: d.rads || d.raiz, notas: d.notas || d.raiz, prefat: d.prefat, prefatXlsx: d.prefatXlsx, raiz: d.raiz };
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
  exigirLeitura_(token);
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
    } else if (/rad|relat/i.test(caminho + nome) && !/fatur/i.test(nome) &&
               (mime === MimeType.GOOGLE_SHEETS || mime === MimeType.MICROSOFT_EXCEL || mime === MimeType.MICROSOFT_EXCEL_LEGACY ||
                /\.(xlsx|xlsm|xls|html?)$/i.test(nome))) {
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
  exigirLeitura_(token);
  var cache = lerCache_(), out = {};
  ids.forEach(function (id) { if (cache[id]) out[id] = filtrarImpressao_(cache[id].fp, chaves); });
  return out;
}

/**
 * Chamado pelo painel com um lote de IDs de PDF: lê cada um (OCR) até o limite de tempo.
 * Devolve { fps: {id: impressão filtrada}, pendentes: [ids não processados], erros: {id: msg} }.
 */
function lerImpressoesPdf(token, ids, chaves) {
  exigirLeitura_(token);
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
  exigirLeitura_(token);
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
  // Limpa só .zip com mais de 1 hora: não apaga o de outra pessoa que acabou de gerar e ainda vai baixar.
  var antigos = destino.getFiles(), limite = Date.now() - 3600 * 1000;
  while (antigos.hasNext()) {
    var a = antigos.next();
    if (/\.zip$/i.test(a.getName()) && a.getDateCreated().getTime() < limite) a.setTrashed(true);
  }
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

/** Informa ao painel o que foi encontrado a partir da raiz. */
function getConfig(token) {
  exigirGestor_(token);
  var ids = idsPastas_();
  var info = function (id, pasta) {
    if (!id) return { id: '', nome: '', url: '', erro: 'não encontrada' };
    try {
      var p = pasta ? DriveApp.getFolderById(id) : DriveApp.getFileById(id);
      return { id: id, nome: p.getName(), url: p.getUrl() };
    } catch (e) { return { id: id, nome: '', url: '', erro: 'sem acesso' }; }
  };
  return {
    raiz: info(ids.raiz, true),
    rads: ids.rads === ids.raiz ? { id: ids.raiz, nome: '(pasta “RAD” não encontrada — lendo a raiz toda)' } : info(ids.rads, true),
    notas: ids.notas === ids.raiz ? { id: ids.raiz, nome: '(pasta de notas não encontrada — lendo a raiz toda)' } : info(ids.notas, true),
    prefat: info(idPrefat_(), false), prefatXlsx: ids.prefatXlsx
  };
}

/* ------------------------------------------------------------------ */
/* Pré-faturamento: painel da planilha de verificação                  */
/* ------------------------------------------------------------------ */

// Planilha e aba do pré-faturamento. Normalmente é achada sozinha dentro da raiz (Planilha Google com
// "FATUR" no nome); PREFAT_PLANILHA_ID só é usado se nenhuma for encontrada.
var PREFAT_PLANILHA_ID = '';
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

function idPrefat_(forcar) {
  var d = {};
  try { d = forcar ? descobrir_(true) : idsPastas_(); } catch (e) {}
  return d.prefat || PREFAT_PLANILHA_ID;
}

/** Abre a planilha de pré-faturamento; se não achar (ou mudou), procura de novo na raiz antes de desistir. */
function abrirPrefat_(forcar) {
  try { return abrirPrefatId_(idPrefat_(forcar)); }
  catch (e) {
    if (forcar) throw e;
    return abrirPrefatId_(idPrefat_(true));
  }
}

function abrirPrefatId_(idPf) {
  var ss;
  if (!idPf) {
    var xl = '';
    try { xl = idsPastas_().prefatXlsx; } catch (e) {}
    throw new Error(xl ? 'A planilha de pré-faturamento “' + xl + '” está em Excel (.xlsx) e não há uma Planilha Google com “FATUR” no nome dentro da pasta raiz. Abra o .xlsx, use Arquivo › Salvar como Planilhas Google e confira se a cópia ficou dentro da pasta raiz (ou de uma subpasta); depois clique em ↻ Atualizar.'
                       : 'Planilha de pré-faturamento não encontrada na pasta raiz (procurei uma Planilha Google com “FATUR” no nome).');
  }
  try { ss = SpreadsheetApp.openById(idPf); }
  catch (e) {
    var mime = '';
    try { mime = DriveApp.getFileById(idPf).getMimeType(); } catch (e2) {}
    if (mime && mime !== MimeType.GOOGLE_SHEETS) {
      throw new Error('A planilha de pré-faturamento está em formato Excel (.xlsx) e não pode ser editada pelo painel. ' +
        'Abra-a e use Arquivo › Salvar como Planilhas Google; depois troque PREFAT_PLANILHA_ID no Code.gs pelo ID da nova planilha.');
    }
    throw new Error('Sem acesso à planilha de pré-faturamento (' + idPf + '): ' + (e && e.message || e));
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
function getPrefat(token, atualizar) {
  exigirGestor_(token);
  var p = abrirPrefat_(!!atualizar), aba = p.aba;
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
// Administrador inicial (CPE). Só o hash da senha fica no código; é criado se ainda não existir
// e, depois disso, a senha pode ser trocada pelo próprio admin em "Trocar senha".
var ADMIN_INICIAL = { login: 'frotacpe', nome_pm: 'Administrador — Frota CPE', cia: 'CPE', unidade: 'CPE',
                      sal: 'eHvZdKLsGHzi4gU-', hash: 'AZ2mTHuvhFl2yOoSmIc0wpbK/z8PNC4l20Fj8bGRCRg=' };
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
  var aba = abaUsuarios_();
  garantirAdmin_(aba);
  var n = aba.getLastRow();
  if (n < 2) return [];
  return aba.getRange(2, 1, n - 1, USU_CAB.length).getValues().map(function (l, i) {
    var u = { linha: i + 2 };
    USU_CAB.forEach(function (c, k) { u[c] = String(l[k] == null ? '' : l[k]); });
    return u;
  });
}

function garantirAdmin_(aba) {
  var n = aba.getLastRow();
  var logins = n > 1 ? aba.getRange(2, 1, n - 1, 1).getValues().map(function (l) { return String(l[0]); }) : [];
  if (logins.indexOf(ADMIN_INICIAL.login) > -1) return;
  var u = { login: ADMIN_INICIAL.login, nome_pm: ADMIN_INICIAL.nome_pm, cia: ADMIN_INICIAL.cia, unidade: ADMIN_INICIAL.unidade,
            hash: ADMIN_INICIAL.hash, sal: ADMIN_INICIAL.sal, status: 'APROVADO', perfil: 'GESTOR',
            solicitado_em: agora_(), decidido_em: agora_(), decidido_por: 'configuração inicial' };
  aba.appendRow(USU_CAB.map(function (c) { return u[c] == null ? '' : u[c]; }));
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

/** Leitura dos dados de impostos/notas: gestão e SOFI. */
function exigirLeitura_(token) {
  if (gestorGoogle_()) return { perfil: 'GESTOR', nome: gestorGoogle_() };
  var s = sessao_(token);
  if (s && (s.perfil === 'GESTOR' || s.perfil === 'SOFI')) return s;
  throw new Error('Acesso restrito à gestão e à SOFI.');
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
    var cu = colunaPorNome_(cab, USU_COL_UNIDADE), cc = colunaPorNome_(cab, USU_COL_CIA);
    if (cc === cu) cc = -1;
    var uniq = function (c) {
      if (c < 0) return [];
      return v.slice(h + 1).map(function (l) { return String(l[c]).trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort();
    };
    o.unidades = uniq(cu); o.cias = uniq(cc);
    o.ciasPorUnidade = {};
    if (cu > -1 && cc > -1) v.slice(h + 1).forEach(function (l) {
      var un = String(l[cu]).trim(), ci = String(l[cc]).trim();
      if (!un || !ci) return;
      o.ciasPorUnidade[un] = o.ciasPorUnidade[un] || [];
      if (o.ciasPorUnidade[un].indexOf(ci) < 0) o.ciasPorUnidade[un].push(ci);
    });
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
    if (['GESTOR', 'SOFI', 'USUARIO'].indexOf(dados.perfil) > -1) u.perfil = dados.perfil;
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

/* Regras da visão do usuário (ajuste aqui se os nomes das colunas ou situações mudarem). */
var USU_COL_UNIDADE = /^unidade|^upm\b|^opm\b|^batalhao/;
var USU_COL_CIA = /(^|[^a-z])cia([^a-z]|$)|companhia|sub.?unidade|^fracao/;
var USU_COL_STATUS = /verificac|status|situac|aprovac|parecer/;
// o usuário só vê as notas aguardando aprovação ("AGUARDANDO APROVAÇÃO", "PARA APROVAÇÃO", "EM APROVAÇÃO"…)
var USU_STATUS_VISIVEL = /aguard|para (a )?aprov|em aprov|a aprovar|aprovacao pendente|pendente de aprov/;
var USU_OCULTAR = [/(^|[^a-z])rad([^a-z]|$)/, /(^|[^a-z])pa([^a-z]|$)/]; // colunas de RAD, nº do RAD e PA

function tokens_(x) { return normPrefat_(x).split(/[^a-z0-9]+/).filter(String); }
function contemTokens_(alvo, ref) {
  var a = tokens_(alvo), r = tokens_(ref);
  return r.length > 0 && r.every(function (t) { return a.indexOf(t) > -1; });
}

function colunasUsuario_(cab) {
  var c = {
    cu: colunaPorNome_(cab, USU_COL_UNIDADE),
    cc: colunaPorNome_(cab, USU_COL_CIA),
    cr: colunaPorNome_(cab, /^resposta/),
    obs: colunaPorNome_(cab, /^obs/),
    status: []
  };
  if (c.cc === c.cu) c.cc = -1;
  cab.forEach(function (h, i) { if (USU_COL_STATUS.test(normPrefat_(h))) c.status.push(i); });
  c.visiveis = cab.map(function (h, i) { return i; }).filter(function (i) {
    var n = normPrefat_(cab[i]);
    return n && !USU_OCULTAR.some(function (re) { return re.test(n); });
  });
  return c;
}

function compacto_(x) { return normPrefat_(x).replace(/[^a-z0-9]/g, ''); }
function semPrefixoUnidade_(k) { return k.replace(/^\d*(bpm|bpe|bpmamb|batalhao|cia|pm)/, ''); }

/** "BPMRV" = "BPM RV" = "RV" (sem o prefixo BPM); também aceita a sigla dentro de um texto maior ("6ª CIA BPMRV"). */
function unidadeConfere_(celula, unidade) {
  var kc = compacto_(celula), ku = compacto_(unidade);
  if (!ku || !kc) return false;
  if (kc === ku || contemTokens_(celula, unidade)) return true;
  var sc = semPrefixoUnidade_(kc), su = semPrefixoUnidade_(ku);
  if (su && sc === su) return true;
  return tokens_(celula).some(function (t) { var st = semPrefixoUnidade_(t); return t === ku || (su && st === su); });
}

/** "6 cia" = "6ª CIA" = "6ªCIA" = "6ª Cia PM", mas não "16ª CIA". Sem número, compara por palavras. */
function ciaConfere_(celula, cia) {
  var n = (String(cia).match(/\d+/) || [])[0];
  var t = normPrefat_(celula);
  if (!n) return contemTokens_(celula, cia) || compacto_(celula) === compacto_(cia);
  n = String(+n);
  var temNumero = new RegExp('(^|[^0-9])0*' + n + '(?![0-9])').test(t);
  if (!temNumero) return false;
  // Na coluna própria de Cia basta o número; num texto junto da Unidade, exige "cia"/"companhia" perto do número.
  return /cia|companhia/.test(t) ? new RegExp('(^|[^0-9])0*' + n + '\\D{0,4}(cia|companhia)').test(t) || /^\D*\d+\D*$/.test(t) : true;
}

/** A linha é da Unidade e da Cia do usuário? Sem coluna de Cia, a Cia precisa estar escrita junto da Unidade. */
function linhaDoUsuario_(l, c, s) {
  var textoUnidade = String(l[c.cu]) + ' ' + (c.cc > -1 ? l[c.cc] : '');
  if (!unidadeConfere_(textoUnidade, s.unidade) && !unidadeConfere_(l[c.cu], s.unidade)) return false;
  return ciaConfere_(c.cc > -1 ? l[c.cc] : l[c.cu], s.cia);
}

function aguardando_(l, c) {
  return c.status.some(function (i) { return USU_STATUS_VISIVEL.test(normPrefat_(l[i])); });
}

/** Gestão: mostra por que um usuário vê (ou não) as linhas da planilha. */
function diagnosticoUsuario(token, login) {
  exigirGestor_(token);
  var u = lerUsuarios_().filter(function (x) { return x.login === normLogin_(login); })[0];
  if (!u) throw new Error('Usuário não encontrado.');
  var aba = abrirPrefat_().aba;
  var v = aba.getDataRange().getDisplayValues(), h = cabecalhoPrefat_(v), cab = v[h];
  var c = colunasUsuario_(cab), s = { unidade: u.unidade, cia: u.cia };
  var out = { unidade: u.unidade, cia: u.cia, colUnidade: c.cu > -1 ? cab[c.cu] : '(não encontrada)', colCia: c.cc > -1 ? cab[c.cc] : '(não encontrada — Cia procurada no texto da Unidade)',
              colStatus: c.status.map(function (i) { return cab[i]; }), total: 0, daUnidade: 0, daCia: 0, aguardando: 0,
              ciasDaUnidade: {}, situacoesDaCia: {}, unidadesNaPlanilha: {} };
  for (var r = h + 1; r < v.length; r++) {
    var l = v[r];
    if (!l.some(String)) continue;
    out.total++;
    if (c.cu > -1) out.unidadesNaPlanilha[l[c.cu]] = (out.unidadesNaPlanilha[l[c.cu]] || 0) + 1;
    var textoUnidade = String(l[c.cu]) + ' ' + (c.cc > -1 ? l[c.cc] : '');
    if (!(unidadeConfere_(textoUnidade, s.unidade) || unidadeConfere_(l[c.cu], s.unidade))) continue;
    out.daUnidade++;
    var vc = c.cc > -1 ? l[c.cc] : l[c.cu];
    out.ciasDaUnidade[vc] = (out.ciasDaUnidade[vc] || 0) + 1;
    if (!ciaConfere_(vc, s.cia)) continue;
    out.daCia++;
    var st = c.status.map(function (i) { return l[i]; }).filter(String).join(' / ') || '(vazio)';
    out.situacoesDaCia[st] = (out.situacoesDaCia[st] || 0) + 1;
    if (aguardando_(l, c)) out.aguardando++;
  }
  return out;
}

/** Notas da Unidade/Cia do usuário que estão aguardando aprovação — só as colunas permitidas. */
function getMinhasNotas(token) {
  var s = exigirUsuario_(token);
  var aba = abrirPrefat_().aba;
  garantirColunaResposta_(aba);
  var v = aba.getDataRange().getDisplayValues(), h = cabecalhoPrefat_(v), cab = v[h];
  var c = colunasUsuario_(cab);
  if (c.cu < 0) throw new Error('A planilha de pré-faturamento não tem a coluna UNIDADE.');
  if (!c.status.length) throw new Error('Não encontrei a coluna de situação (VERIFICAÇÃO/STATUS) na planilha de pré-faturamento.');
  var linhas = [];
  for (var r = h + 1; r < v.length; r++) {
    var l = v[r];
    if (!l.some(String) || !linhaDoUsuario_(l, c, s) || !aguardando_(l, c)) continue;
    linhas.push({ linha: r + 1, v: c.visiveis.map(function (i) { return l[i]; }) });
  }
  var pos = function (i) { return c.visiveis.indexOf(i); };
  var st = c.status.filter(function (i) { return pos(i) > -1; });
  return {
    cab: c.visiveis.map(function (i) { return cab[i]; }), linhas: linhas,
    colResposta: pos(c.cr), colStatus: st.length ? pos(st[0]) : -1, colObs: pos(c.obs),
    filtroCia: c.cc > -1, unidade: s.unidade, cia: s.cia, nome: s.nome_pm, atualizadoEm: agora_()
  };
}

/** O usuário só pode gravar a RESPOSTA, e só numa linha da sua Unidade/Cia. */
function responder(token, linha, texto, anterior) {
  var s = exigirUsuario_(token);
  var aba = abrirPrefat_().aba;
  var topo = aba.getRange(1, 1, Math.min(15, Math.max(1, aba.getLastRow())), Math.max(1, aba.getLastColumn())).getDisplayValues();
  var h = cabecalhoPrefat_(topo), cab = topo[h];
  var c = colunasUsuario_(cab), cr = c.cr;
  if (cr < 0 || c.cu < 0 || linha <= h + 1) throw new Error('Linha inválida.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var l = aba.getRange(linha, 1, 1, cab.length).getDisplayValues()[0];
    if (!linhaDoUsuario_(l, c, s) || !aguardando_(l, c)) throw new Error('Sem permissão para esta linha.');
    var cel = aba.getRange(linha, cr + 1);
    if (anterior != null && cel.getDisplayValue() !== anterior) return { conflito: true, atual: cel.getDisplayValue() };
    texto = String(texto || '').slice(0, 2000);
    cel.setValue(texto);
    cel.setNote(texto ? 'Respondido por ' + s.nome_pm + ' (' + s.login + ') em ' + agora_() : '');
    return { ok: true, valor: cel.getDisplayValue() };
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Inserir RADs pelo painel (organizados por período)                  */
/* ------------------------------------------------------------------ */

/** Unidade e período escritos no cabeçalho do RAD. */
function infoRad_(grade) {
  var unidade = '', periodo = null;
  grade.forEach(function (l) {
    l.forEach(function (c, i) {
      var t = String(c);
      if (!unidade && /^(Nome|C[oó]digo) [OÓ]rg[aã]o \/ Entidade:?$/i.test(t)) unidade = l.slice(i + 1).filter(String)[0] || '';
      var m = !periodo && /Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
      if (m) periodo = { ini: m[3] + '-' + m[2] + '-' + m[1], fim: m[6] + '-' + m[5] + '-' + m[4], dia: +m[1], mes: m[3] + '-' + m[2] };
    });
  });
  return { unidade: unidade.replace(/^\d+\s*[ºª°A-Z]?\s+/i, '').trim() || unidade, periodo: periodo };
}

function pastaFilha_(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/**
 * Chamado pelo painel com os .xls baixados do sistema ({nome, base64}). Cada RAD é guardado na pasta de RADs,
 * na subpasta do período ("2026-09 · 2ª quinzena"), com o nome "RAD <Unidade> <AAAA-MM> <1ª|2ª> quinzena.xls".
 * Se já existir um RAD com o mesmo nome (mesma Unidade e período), o anterior vai para a lixeira.
 */
function salvarRads(token, arquivos) {
  exigirGestor_(token);
  var ids = idsPastas_();
  var pastaRads;
  if (ids.rads && ids.rads !== ids.raiz) pastaRads = DriveApp.getFolderById(ids.rads);
  else {
    pastaRads = pastaFilha_(DriveApp.getFolderById(ids.raiz), 'RADs');
    PropertiesService.getScriptProperties().deleteProperty('DESCOBERTA');
  }
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    return arquivos.map(function (a) {
      try {
        var blob = Utilities.newBlob(Utilities.base64Decode(a.base64), 'application/vnd.ms-excel', a.nome);
        var html = blob.getDataAsString('UTF-8');
        if (!/title-rad|Sint(&eacute;|é)tico da Despesa/i.test(html)) return { nome: a.nome, ok: false, msg: 'não é um RAD do sistema' };
        var info = infoRad_(gradeDoHtml_(html));
        if (!info.periodo) return { nome: a.nome, ok: false, msg: 'período não encontrado no RAD' };
        var q = info.periodo.dia <= 15 ? '1ª quinzena' : '2ª quinzena';
        var sub = pastaFilha_(pastaRads, info.periodo.mes + ' · ' + q);
        var nome = ('RAD ' + (info.unidade || 'sem unidade') + ' ' + info.periodo.mes + ' ' + q + '.xls').replace(/[\\/:*?"<>|]/g, '-');
        var antigos = sub.getFilesByName(nome), substituido = false;
        while (antigos.hasNext()) { antigos.next().setTrashed(true); substituido = true; }
        sub.createFile(blob.setName(nome));
        return { nome: a.nome, ok: true, salvo: nome, pasta: sub.getName(), substituido: substituido };
      } catch (e) {
        return { nome: a.nome, ok: false, msg: String(e && e.message || e) };
      }
    });
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Inserir notas fiscais (PDF) pelo painel                             */
/* ------------------------------------------------------------------ */

/**
 * Chamado pelo painel para cada PDF ({nome, base64}). Guarda na pasta de notas, na subpasta da quinzena
 * escolhida ("2026-09 · 2ª quinzena"). Se já existir um PDF com o mesmo nome e tamanho, não duplica.
 * Devolve o PDF no formato da lista do painel, para ele já procurar a nota sem recarregar tudo.
 */
function salvarNota(token, arq, destino) {
  exigirGestor_(token);
  var bytes = Utilities.base64Decode(arq.base64);
  if (!(bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return { nome: arq.nome, ok: false, msg: 'não é um PDF' };
  }
  var ids = idsPastas_();
  var pastaNotas;
  if (ids.notas && ids.notas !== ids.raiz) pastaNotas = DriveApp.getFolderById(ids.notas);
  else {
    pastaNotas = pastaFilha_(DriveApp.getFolderById(ids.raiz), 'Notas Fiscais');
    PropertiesService.getScriptProperties().deleteProperty('DESCOBERTA');
  }
  var mes = /^\d{4}-\d{2}$/.test(destino && destino.mes) ? destino.mes : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var q = destino && (destino.q === 1 || destino.q === 2) ? destino.q : (new Date().getDate() <= 15 ? 1 : 2);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sub = pastaFilha_(pastaNotas, mes + ' · ' + q + 'ª quinzena');
    var nome = String(arq.nome || 'nota.pdf').replace(/[\\/:*?"<>|]/g, '-');
    if (!/\.pdf$/i.test(nome)) nome += '.pdf';
    var iguais = sub.getFilesByName(nome);
    while (iguais.hasNext()) {
      var f = iguais.next();
      if (f.getSize() === bytes.length) return { nome: arq.nome, ok: true, duplicado: true, pasta: sub.getName(), pdf: null };
      nome = nome.replace(/(\.pdf)$/i, ' (' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'ddMMyy-HHmmss') + ')$1');
    }
    var novo = sub.createFile(Utilities.newBlob(bytes, MimeType.PDF, nome));
    var caminho = (pastaNotas.getId() === ids.notas ? '' : pastaNotas.getName() + '/') + sub.getName() + '/';
    return { nome: arq.nome, ok: true, pasta: sub.getName(), pdf: { id: novo.getId(), nome: nome, caminho: caminho, lido: false } };
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* SOFI: controle de pagamento dos RADs                                */
/* ------------------------------------------------------------------ */
/*
 * Cada RAD = Unidade + período (ex.: "BPMRV|2026-09-16|2026-09-30"). Os totais são calculados no painel a partir
 * dos RADs lidos; aqui fica só o registro de pagamento, na aba oculta "_rads_pagos" da planilha do painel.
 */
var ABA_PAGOS = '_rads_pagos';
var PAGOS_CAB = ['chave', 'unidade', 'periodo', 'qtd_os', 'valor_aprovado', 'impostos', 'taxa_adm', 'valor_liquido', 'pago', 'pago_em', 'pago_por'];

function abaPagos_() {
  var ss = painelSS_();
  var aba = ss.getSheetByName(ABA_PAGOS);
  if (!aba) {
    aba = ss.insertSheet(ABA_PAGOS);
    aba.getRange(1, 1, 1, PAGOS_CAB.length).setValues([PAGOS_CAB]);
    aba.hideSheet();
  }
  return aba;
}

/** Situação de pagamento de todos os RADs já marcados: { chave: {pago, em, por} }. */
function listarPagamentos(token) {
  exigirLeitura_(token);
  var aba = abaPagos_(), n = aba.getLastRow(), out = {};
  if (n < 2) return out;
  aba.getRange(2, 1, n - 1, PAGOS_CAB.length).getDisplayValues().forEach(function (l) {
    out[l[0]] = { pago: l[8] === 'SIM', em: l[9], por: l[10] };
  });
  return out;
}

/** Marca (pago = true) ou desmarca um RAD como pago pela SOFI, guardando os totais do momento. */
function marcarPago(token, chave, resumo, pago) {
  var s = exigirLeitura_(token);
  var quem = s.nome_pm || s.nome || s.login || '';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var aba = abaPagos_(), n = aba.getLastRow();
    var chaves = n > 1 ? aba.getRange(2, 1, n - 1, 1).getValues().map(function (l) { return String(l[0]); }) : [];
    var r = resumo || {};
    var linha = [chave, r.unidade || '', r.periodo || '', r.qtd || 0, r.aprovado || 0, r.impostos || 0, r.adm || 0, r.liquido || 0,
                 pago ? 'SIM' : 'NÃO', pago ? agora_() : '', pago ? quem : ''];
    var i = chaves.indexOf(chave);
    if (i > -1) aba.getRange(i + 2, 1, 1, PAGOS_CAB.length).setValues([linha]);
    else aba.appendRow(linha);
    return { ok: true, pago: !!pago, em: linha[9], por: linha[10] };
  } finally { lock.releaseLock(); }
}
