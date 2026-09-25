/**
 * Rota Preventiva | Estado-Maior do CPE / PMRv (PMMG)
 *
 * A planilha é lida de forma tolerante:
 *  1. todas as abas são examinadas (não só "STV"/"Frações");
 *  2. as colunas são achadas pelo CABEÇALHO (qualquer ordem, linha 1 a 15);
 *  3. se não houver cabeçalho de RPM/Cia/Pel/Gp, a coluna é achada pelo CONTEÚDO
 *     (ex.: "1ª RPM", "2ª Cia PMRv", "3º Pel", ou um texto combinado
 *     "1º Gp / 2º Pel / 3ª Cia PMRv / 4ª RPM");
 *  4. se a base STV só tiver o município, RPM/Cia/Pel/Gp vêm da aba de frações
 *     (município → fração responsável), cobrindo a área territorial da fração.
 * Códigos internos (nº REDS, IBGE, IDs) nunca aparecem na interface.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Rota Preventiva | Estado-Maior CPE / PMRv')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const CFG = {
  STV_SHEETS: ['STV', 'Base STV', 'Dados STV'],
  DICTIONARY_SHEETS: ['Mapa Frações', 'Mapa Fracoes', 'Dicionário', 'Dicionario'],
  CACHE_PREFIX: 'rota_preventiva_v8_',
  CACHE_SECONDS: 1800,
  HEADER_SCAN_ROWS: 15,
  SAMPLE_ROWS: 300,
  MAX_ROUTE_POINTS: 10,
  MAX_MAP_POINTS: 600
};

const TYPES = ['rpm', 'cia', 'pelotao', 'grupamento', 'cidade'];
const HIER = ['rpm', 'cia', 'pelotao', 'grupamento'];

/** Sinônimos aceitos no cabeçalho (comparados sem acento, minúsculos, sem pontuação). */
const FIELD_ALIASES = {
  rpm: ['rpm', 'regiao', 'regiao policial', 'regiao da policia militar', 'regiao pm'],
  cia: ['cia', 'companhia', 'cia pmrv', 'companhia pmrv', 'cia rv', 'cias'],
  pelotao: ['pelotao', 'pel', 'pel pmrv', 'pelotao pmrv', 'pelotoes'],
  grupamento: ['grupamento', 'gp', 'gp pmrv', 'grupamento pmrv', 'destacamento', 'grupamentos'],
  cidade: ['municipio', 'cidade', 'municipio cidade', 'localidade', 'municipios', 'cidades'],
  fracao: ['fracao', 'fracao responsavel', 'unidade', 'unidade responsavel', 'ueop', 'subunidade',
           'lotacao', 'uop', 'fracao pmrv', 'unidade pmrv', 'hierarquia', 'responsavel', 'fracoes'],
  lat: ['latitude', 'lat', 'y', 'coord y'],
  lng: ['longitude', 'long', 'lng', 'lon', 'x', 'coord x'],
  coord: ['coordenadas', 'coordenada', 'lat long', 'latlong', 'lat lng', 'geolocalizacao'],
  hora: ['hora', 'horario', 'hora fato', 'hora do fato', 'hora ocorrencia', 'data hora', 'data hora fato'],
  escore: ['escore', 'score', 'escore de risco', 'risco', 'indice de risco', 'peso'],
  rodovia: ['rodovia', 'br', 'via', 'rodovia km', 'trecho']
};
/** Palavras que indicam coluna de código/ID (usada só para traduzir código → nome). */
const CODE_WORDS = ['cod', 'codigo', 'id', 'num', 'numero', 'nr', 'n', 'ibge', 'sigla', 'reds', 'chave'];
/** Palavras que tornam a coluna preferencial como "nome por extenso". */
const NAME_WORDS = ['nome', 'descricao', 'desc', 'extenso'];

/** Reconhece RPM/Cia/Pel/Gp dentro de qualquer texto ("1ª RPM", "RPM 1", "3º PEL/2ª CIA"...). */
const HIER_RX = {
  rpm: [/(\d{1,2})\s*[ªºa°]?\s*\.?\s*RPM(?![A-Z])/i, /RPM\s*[-:]?\s*(\d{1,2})(?!\d)/i,
        /(\d{1,2})\s*[ªºa°]?\s*\.?\s*REGI[AÃ]O/i],
  cia: [/(\d{1,2})\s*[ªºa°]?\s*\.?\s*(?:CIA|COMPANHIA)(?![A-Z])/i, /(?:CIA|COMPANHIA)\s*[-:]?\s*(\d{1,2})(?!\d)/i],
  pelotao: [/(\d{1,2})\s*[ºo°]?\s*\.?\s*PEL(?:OT[AÃ]O)?(?![A-Z])/i, /PEL(?:OT[AÃ]O)?\s*[-:]?\s*(\d{1,2})(?!\d)/i],
  grupamento: [/(\d{1,2})\s*[ºo°]?\s*\.?\s*(?:GP|GRUP(?:AMENTO)?)(?![A-Z])/i, /(?:GP|GRUPAMENTO)\s*[-:]?\s*(\d{1,2})(?!\d)/i]
};

/* ======================================================================= */
/*  API chamada pelo front-end                                             */
/* ======================================================================= */

/** Opções dos seletores (nomes amigáveis, sem códigos). */
function getDadosCompletosFiltros() {
  const cached = cacheGet_('options');
  if (cached) return cached;

  const ctx = loadContext_();
  const result = {
    rpms: ctx.options.rpm,
    cias: ctx.options.cia,
    pelotoes: ctx.options.pelotao,
    grupamentos: ctx.options.grupamento,
    cidades: ctx.options.cidade,
    avisos: ctx.warnings
  };
  // Só guarda em cache quando está tudo certo, para a correção da planilha valer na hora.
  if (!ctx.warnings.length) cacheSet_('options', result);
  return result;
}

/** Filtra a base STV. Cada filtro é opcional e 100% independente dos demais. */
function calcularRotaAvancada(p) {
  p = p || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = cacheGet_('ctx') || loadContext_();
  const labels = ctx.labels, cityHier = ctx.cityHier || {};

  const found = findStvTable_(ss);
  if (!found) throw new Error('Não encontrei a base STV: nenhuma aba tem colunas de Latitude/Longitude (ou "Coordenadas").');
  const table = found.table, col = table.columns;

  const selected = {};
  TYPES.forEach(t => selected[t] = selectedKey_(p[t]));
  const from = finite_(p.horaInicio), to = finite_(p.horaFim), useHours = from !== null && to !== null;
  const radius = Math.max(100, Math.min(5000, finite_(p.raioDensidade) || 1000));
  const tz = ss.getSpreadsheetTimeZone();
  const grouped = Object.create(null);
  const box = { s: 90, n: -90, w: 180, e: -180 };
  let total = 0;

  table.rows.forEach(r => {
    let lat, lng;
    if (col.lat >= 0 && col.lng >= 0) { lat = coord_(r[col.lat], 90); lng = coord_(r[col.lng], 180); }
    else { const c = splitCoord_(r[col.coord]); lat = c[0]; lng = c[1]; }
    if (lat === null || lng === null || (lat === 0 && lng === 0)) return;

    const v = rowNames_(r, table, labels, cityHier);
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i];
      if (selected[t] && key_(v[t]) !== selected[t]) return;
    }
    if (useHours && col.hora >= 0) {
      const hour = getHour_(r[col.hora], tz);
      if (hour !== null) {
        const inWindow = from <= to ? hour >= from && hour <= to : hour >= from || hour <= to;
        if (!inWindow) return;
      }
    }

    total++;
    box.s = Math.min(box.s, lat); box.n = Math.max(box.n, lat);
    box.w = Math.min(box.w, lng); box.e = Math.max(box.e, lng);

    const road = col.rodovia >= 0 ? String(r[col.rodovia] || '').trim() : '';
    const fraction = [v.cia, v.pelotao, v.grupamento].filter(Boolean).join(' / ') || v.rpm || 'PMRv';
    const score = col.escore >= 0 ? number_(r[col.escore]) : null;
    // Agrupa pontos próximos (~110 m) na mesma rodovia/cidade.
    const k = [lat.toFixed(3), lng.toFixed(3), key_(road), key_(v.cidade)].join('|');
    let h = grouped[k];
    if (!h) h = grouped[k] = { sumLat: 0, sumLng: 0, rodovia: road, cidade: v.cidade, fracao: fraction, qtd: 0, total: 0, n: 0 };
    h.sumLat += lat; h.sumLng += lng; h.qtd++;
    if (score !== null) { h.total += score; h.n++; }
  });

  let hotspots = Object.keys(grouped).map(k => {
    const h = grouped[k];
    const media = h.n ? h.total / h.n : 1;
    return {
      lat: round_(h.sumLat / h.qtd, 6), lng: round_(h.sumLng / h.qtd, 6),
      rodovia: h.rodovia, cidade: h.cidade, fracao: h.fracao, qtd: h.qtd,
      // Escore combina a gravidade média com o volume de registros STV no ponto.
      escore: round_(media * Math.log(1 + h.qtd) * 10, 1), raio: radius
    };
  }).sort((a, b) => b.escore - a.escore || b.qtd - a.qtd);

  const totalHotspots = hotspots.length;
  hotspots = hotspots.slice(0, CFG.MAX_MAP_POINTS);
  const route = orderRoute_(hotspots.slice(0, CFG.MAX_ROUTE_POINTS));
  const linkMaps = route.length ? 'https://www.google.com/maps/dir/' + route.map(h => h.lat + ',' + h.lng).join('/') : '';
  const linkWaze = route.length ? 'https://waze.com/ul?ll=' + route[0].lat + ',' + route[0].lng + '&navigate=yes' : '';

  return {
    hotspots: hotspots,
    rota: route.map(h => [h.lat, h.lng]),
    bounds: total ? [[box.s, box.w], [box.n, box.e]] : null,
    totalRegistros: total,
    totalHotspots: totalHotspots,
    linkMaps: linkMaps,
    linkWaze: linkWaze,
    raio: radius
  };
}

/** Limpa o cache (rode pelo editor após alterar a planilha). */
function limparCache() {
  CacheService.getScriptCache().removeAll(['options', 'ctx'].map(k => CFG.CACHE_PREFIX + k));
}

/** Diagnóstico: rode pelo editor (Executar ▸ diagnosticarPlanilha) e veja o Log. */
function diagnosticarPlanilha() {
  limparCache();
  const ctx = loadContext_();
  const report = ctx.sheetsInfo.slice();
  TYPES.forEach(t => report.push(t.toUpperCase() + ': ' + ctx.options[t].length + ' opções → ' + ctx.options[t].slice(0, 8).join(', ')));
  ctx.warnings.forEach(w => report.push('AVISO: ' + w));
  Logger.log(report.join('\n'));
  return report;
}

/* ======================================================================= */
/*  Montagem das opções, dicionário código → nome e município → fração     */
/* ======================================================================= */

function loadContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const warnings = [], sheetsInfo = [];
  const labels = {}; TYPES.forEach(t => labels[t] = Object.create(null));
  const optionSets = {}; TYPES.forEach(t => optionSets[t] = Object.create(null));
  const opaqueSamples = {}; TYPES.forEach(t => opaqueSamples[t] = []);
  const cityHier = Object.create(null);

  // 1) Dicionário explícito (opcional): Tipo | Código | Nome oficial
  const dict = findSheet_(ss, CFG.DICTIONARY_SHEETS);
  readDictionary_(ss).forEach(row => {
    const type = typeKey_(row[0]);
    const code = String(row[1] || '').trim();
    const name = String(row[2] || '').trim();
    if (type && code && name) labels[type][code] = friendly_(name, type);
  });

  // 2) Todas as abas; lê só as colunas de hierarquia/município.
  const tables = [];
  ss.getSheets().forEach(sheet => {
    if (dict && sheet.getSheetId() === dict.getSheetId()) return;
    const t = readTable_(sheet, { fields: TYPES });
    sheetsInfo.push(describeTable_(sheet, t));
    if (TYPES.some(type => hasSource_(t, type)) && t.rows.length) tables.push(t);
  });

  // 2a) Pareia código ↔ nome quando a mesma linha traz os dois.
  tables.forEach(t => TYPES.forEach(type => {
    const nc = t.columns[type], cc = t.codeColumns[type];
    if (nc < 0 || cc < 0) return;
    t.rows.forEach(r => {
      const name = String(r[nc] || '').trim(), code = String(r[cc] || '').trim();
      if (name && code && !isOpaque_(name)) labels[type][code] = friendly_(name, type);
    });
  }));

  // 2b) Opções + mapa município → RPM/Cia/Pel/Gp.
  tables.forEach(t => t.rows.forEach(r => {
    const v = {};
    TYPES.forEach(type => {
      v[type] = cellName_(r, t, type, labels);
      if (v[type]) optionSets[type][key_(v[type])] = v[type];
      else {
        const raw = rawCell_(r, t, type);
        if (raw && isOpaque_(raw) && opaqueSamples[type].length < 3 && opaqueSamples[type].indexOf(raw) < 0) opaqueSamples[type].push(raw);
      }
    });
    if (v.cidade) {
      const ck = key_(v.cidade);
      const h = cityHier[ck] || (cityHier[ck] = {});
      HIER.forEach(type => { if (v[type] && !h[type]) h[type] = v[type]; });
    }
  }));

  const nice = { rpm: 'RPM', cia: 'Companhia', pelotao: 'Pelotão', grupamento: 'Grupamento', cidade: 'Município' };
  const options = {};
  TYPES.forEach(type => {
    options[type] = Object.keys(optionSets[type]).map(k => optionSets[type][k]).sort(sortPt_);
    if (options[type].length) return;
    if (opaqueSamples[type].length) {
      warnings.push(nice[type] + ': a planilha só tem códigos (ex.: ' + opaqueSamples[type].join(', ') +
        '). Inclua uma coluna com o nome por extenso ou cadastre na aba "Mapa Frações" (Tipo | Código | Nome).');
    } else {
      warnings.push(nice[type] + ': nenhuma coluna reconhecida em nenhuma aba.');
    }
  });
  if (warnings.length) warnings.push('Abas lidas → ' + sheetsInfo.join(' ║ '));

  const ctx = { labels: labels, cityHier: cityHier };
  cacheSet_('ctx', ctx);
  return { labels: labels, cityHier: cityHier, options: options, warnings: warnings, sheetsInfo: sheetsInfo };
}

/** Nomes de uma linha da base; o que faltar é completado pelo município. */
function rowNames_(r, table, labels, cityHier) {
  const v = {};
  TYPES.forEach(t => v[t] = cellName_(r, table, t, labels));
  const h = v.cidade ? cityHier[key_(v.cidade)] : null;
  if (h) HIER.forEach(t => { if (!v[t] && h[t]) v[t] = h[t]; });
  return v;
}
function hasSource_(t, type) {
  return t.columns[type] >= 0 || t.codeColumns[type] >= 0 || (t.extract && t.extract[type] >= 0);
}
function rawCell_(r, t, type) {
  const c = t.columns[type] >= 0 ? t.columns[type] : t.codeColumns[type];
  return c >= 0 ? String(r[c] == null ? '' : r[c]).trim() : '';
}
/** Nome amigável: coluna de nome → coluna de código traduzida → extração do texto. */
function cellName_(r, table, type, labels) {
  const nc = table.columns[type], cc = table.codeColumns[type], xc = table.extract ? table.extract[type] : -1;
  let v = nc >= 0 ? displayName_(r[nc], type, labels[type]) : '';
  if (!v && cc >= 0) v = displayName_(r[cc], type, labels[type]);
  if (v && HIER.indexOf(type) >= 0) {
    // Coluna de Cia contendo "2ª Cia PMRv / 4ª RPM": fica só com a parte da Cia.
    const only = extractHier_(v, type);
    if (only && hierCount_(v) > 1) v = only;
  }
  if (!v && xc >= 0) v = extractHier_(r[xc], type);
  return v;
}
function extractHier_(value, type) {
  const s = String(value == null ? '' : value);
  const list = HIER_RX[type] || [];
  for (let i = 0; i < list.length; i++) {
    const m = s.match(list[i]);
    if (m && Number(m[1]) > 0) return ordinal_(Number(m[1]), type);
  }
  return '';
}
function hierCount_(s) { return HIER.filter(t => extractHier_(s, t)).length; }

/* ======================================================================= */
/*  Leitura da planilha por cabeçalho (+ detecção pelo conteúdo)           */
/* ======================================================================= */

/**
 * Lê uma aba identificando o cabeçalho automaticamente.
 * opts.fields: lê só as colunas desses campos (mais rápido). opts.maxRows: limita linhas.
 */
function readTable_(sheet, opts) {
  opts = opts || {};
  const table = { name: sheet.getName(), headers: [], headerRow: 0, rows: [],
    columns: emptyColumns_(), codeColumns: emptyColumns_(), extract: emptyColumns_() };
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return table;

  const scan = sheet.getRange(1, 1, Math.min(CFG.HEADER_SCAN_ROWS, lastRow), lastCol).getDisplayValues();
  let best = { row: 0, hits: 0, map: mapHeaders_([]) };
  scan.forEach((hdr, i) => {
    const m = mapHeaders_(hdr);
    const hits = Object.keys(m.columns).filter(k => m.columns[k] >= 0 || m.codeColumns[k] >= 0).length;
    if (hits > best.hits) best = { row: i, hits: hits, map: m };
  });
  table.headerRow = best.row + 1;
  table.headers = scan[best.row];
  table.columns = best.map.columns;
  table.codeColumns = best.map.codeColumns;

  const firstData = best.row + 2;
  let nRows = lastRow - firstData + 1;
  if (opts.maxRows) nRows = Math.min(nRows, opts.maxRows);
  if (nRows < 1) return table;

  // Detecção pelo conteúdo: RPM/Cia/Pel/Gp sem cabeçalho reconhecível.
  const missing = HIER.filter(t => table.columns[t] < 0 && table.codeColumns[t] < 0);
  if (missing.length) {
    const sample = sheet.getRange(firstData, 1, Math.min(nRows, CFG.SAMPLE_ROWS), lastCol).getDisplayValues();
    const used = Object.keys(table.columns).map(k => table.columns[k]).filter(c => c >= 0);
    missing.forEach(type => {
      let bestCol = -1, bestScore = 0;
      for (let c = 0; c < lastCol; c++) {
        let filled = 0, hit = 0;
        sample.forEach(r => { const s = String(r[c] || '').trim(); if (!s) return; filled++; if (extractHier_(s, type)) hit++; });
        if (!filled || !hit) continue;
        let score = hit / filled;
        if (c === table.columns.fracao) score += 0.3;
        if (used.indexOf(c) < 0) score += 0.1;
        if (hit / filled >= 0.3 && score > bestScore) { bestScore = score; bestCol = c; }
      }
      table.extract[type] = bestCol;
    });
  }

  // Só lê o intervalo de colunas realmente necessário.
  const wanted = [];
  Object.keys(table.columns).forEach(k => {
    if (opts.fields && opts.fields.indexOf(k) < 0) return;
    [table.columns[k], table.codeColumns[k], table.extract[k]].forEach(c => { if (c >= 0) wanted.push(c); });
  });
  if (!wanted.length) return table;
  const minC = Math.min.apply(null, wanted), maxC = Math.max.apply(null, wanted);
  table.rows = sheet.getRange(firstData, minC + 1, nRows, maxC - minC + 1).getValues();
  const shift = m => { const o = {}; Object.keys(m).forEach(k => o[k] = m[k] >= minC && m[k] <= maxC ? m[k] - minC : -1); return o; };
  table.allHeaders = table.headers;
  table.headers = table.headers.slice(minC, maxC + 1);
  table.columns = shift(table.columns);
  table.codeColumns = shift(table.codeColumns);
  table.extract = shift(table.extract);
  return table;
}

/** Base STV: aba "STV" se tiver coordenadas; senão, a aba com coordenadas e mais linhas. */
function findStvTable_(ss) {
  const hasCoords = t => (t.columns.lat >= 0 && t.columns.lng >= 0) || t.columns.coord >= 0;
  const named = findSheet_(ss, CFG.STV_SHEETS);
  if (named) { const t = readTable_(named); if (hasCoords(t) && t.rows.length) return { sheet: named, table: t }; }
  let best = null;
  ss.getSheets().forEach(sh => {
    if (named && sh.getSheetId() === named.getSheetId()) return;
    const head = readTable_(sh, { maxRows: 1 });
    if (!hasCoords(head)) return;
    if (!best || sh.getLastRow() > best.getLastRow()) best = sh;
  });
  return best ? { sheet: best, table: readTable_(best) } : null;
}

function describeTable_(sheet, t) {
  const hdr = (t.allHeaders || t.headers).map(h => String(h).trim()).filter(String).slice(0, 20);
  const found = TYPES.filter(type => hasSource_(t, type))
    .map(type => type + (t.columns[type] < 0 && t.codeColumns[type] < 0 ? '(pelo conteúdo)' : ''));
  return '"' + sheet.getName() + '" [linha ' + t.headerRow + ': ' + (hdr.join(', ') || 'vazia') + '] → ' +
    (found.length ? 'reconhecido: ' + found.join(', ') : 'nada reconhecido');
}

/** Associa cada campo à melhor coluna do cabeçalho, separando colunas de nome e de código. */
function mapHeaders_(headerRow) {
  const columns = emptyColumns_(), codeColumns = emptyColumns_();
  const score = {}, codeScore = {};
  const fields = Object.keys(FIELD_ALIASES);
  headerRow.forEach((raw, idx) => {
    const h = key_(raw).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!h || h.length > 60) return;
    const tokens = h.split(' ');
    const isCode = tokens.some(w => CODE_WORDS.indexOf(w) >= 0);
    const isName = tokens.some(w => NAME_WORDS.indexOf(w) >= 0);
    let bestField = null, bestScore = 0;
    fields.forEach(f => {
      FIELD_ALIASES[f].forEach(alias => {
        let s = 0;
        if (h === alias) s = 3;
        else if (containsWords_(tokens, alias.split(' '))) s = alias.length > 3 ? 2 : 1;
        if (s > bestScore) { bestScore = s; bestField = f; }
      });
    });
    if (!bestField) return;
    const target = isCode && !isName && TYPES.indexOf(bestField) >= 0 ? codeColumns : columns;
    const board = target === columns ? score : codeScore;
    const s = bestScore + (isName ? 1 : 0);
    if (board[bestField] === undefined || s > board[bestField]) { board[bestField] = s; target[bestField] = idx; }
  });
  return { columns: columns, codeColumns: codeColumns };
}

function emptyColumns_() {
  const o = {}; Object.keys(FIELD_ALIASES).forEach(k => o[k] = -1); return o;
}
function containsWords_(tokens, aliasTokens) {
  for (let i = 0; i + aliasTokens.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < aliasTokens.length; j++) if (tokens[i + j] !== aliasTokens[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
function findSheet_(ss, names) {
  for (let i = 0; i < names.length; i++) { const s = ss.getSheetByName(names[i]); if (s) return s; }
  // Tolerante a acento/maiúsculas/espaços no nome da aba.
  const wanted = names.map(key_);
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (wanted.indexOf(key_(all[i].getName())) >= 0) return all[i];
  return null;
}
/** Opcional: aba "Mapa Frações" com colunas Tipo | Código | Nome oficial. */
function readDictionary_(ss) {
  const sheet = findSheet_(ss, CFG.DICTIONARY_SHEETS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
}

/* ======================================================================= */
/*  Nomes amigáveis                                                        */
/* ======================================================================= */

/** Código interno/ID (ex.: 2020-017737686-001, 310010) — nunca exibido na interface. */
function isOpaque_(s) {
  s = String(s || '').trim();
  return /^\d{4,}$/.test(s) || /^\d[\d.\-\/]{5,}$/.test(s) || /^[A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+){2,}$/.test(s);
}
function typeKey_(s) {
  const v = key_(s).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(rpm|regiao|regiao policial)$/.test(v)) return 'rpm';
  if (/^(cia|companhia|cia pmrv|companhia pmrv)$/.test(v)) return 'cia';
  if (/^(pel|pelotao|pel pmrv|pelotao pmrv)$/.test(v)) return 'pelotao';
  if (/^(gp|grupamento|gp pmrv|grupamento pmrv)$/.test(v)) return 'grupamento';
  if (/^(cidade|municipio|municipio cidade)$/.test(v)) return 'cidade';
  return '';
}
function friendly_(value, type) {
  const s = String(value || '').trim().replace(/\s+/g, ' ');
  if (type !== 'cidade' && /^\d{1,3}$/.test(s)) return ordinal_(Number(s), type);
  const patterns = {
    rpm: '(?:RPM|Regi[aã]o(?:\\s+(?:de\\s+)?Pol[ií]cia(?:\\s+Militar)?)?)',
    cia: '(?:Cia|Companhia)(?:\\s*(?:de\\s+)?(?:PMRv|Pol[ií]cia\\s+Militar\\s+Rodovi[aá]ria))?',
    pelotao: '(?:Pel(?:ot[aã]o)?\\.?)(?:\\s*PMRv)?',
    grupamento: '(?:Gp|Grupamento)(?:\\s*PMRv)?'
  };
  if (patterns[type]) {
    const m = s.match(new RegExp('^(\\d{1,3})\\s*[ªºao°]?\\.?\\s*' + patterns[type] + '$', 'i'));
    if (m) return ordinal_(Number(m[1]), type);
  }
  if (type === 'cidade' && s === s.toUpperCase() && /[A-Z]/.test(s)) return titleCase_(s);
  return s;
}
function ordinal_(n, type) {
  const female = type === 'rpm' || type === 'cia';
  const name = type === 'rpm' ? 'RPM' : type === 'cia' ? 'Cia PMRv' : type === 'pelotao' ? 'Pelotão' : 'Grupamento';
  return n + (female ? 'ª' : 'º') + ' ' + name;
}
function titleCase_(s) {
  const small = ['de', 'da', 'do', 'das', 'dos', 'e'];
  return s.toLowerCase().split(' ').map((w, i) =>
    i > 0 && small.indexOf(w) >= 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function displayName_(raw, type, map) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  if (map && map[s]) return map[s];
  return isOpaque_(s) ? '' : friendly_(s, type);
}
function selectedKey_(value) {
  const s = String(value || '').trim();
  return !s || s.toUpperCase() === 'TODOS' ? '' : key_(s);
}
function key_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function sortPt_(a, b) { return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }); }

/* ======================================================================= */
/*  Números, coordenadas, horas e rota                                     */
/* ======================================================================= */

function number_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
/** Aceita "-19,9167", "-19.9167" e valores sem separador decimal (ex.: -199167000). */
function coord_(value, limit) {
  let n = number_(value);
  if (n === null) return null;
  let guard = 0;
  while (Math.abs(n) > limit && guard++ < 12) n /= 10;
  return Math.abs(n) <= limit ? n : null;
}
function splitCoord_(value) {
  const m = String(value || '').match(/(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return [null, null];
  return [coord_(m[1], 90), coord_(m[2], 180)];
}
function finite_(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function getHour_(value, tz) {
  if (value instanceof Date) return Number(Utilities.formatDate(value, tz, 'H'));
  if (typeof value === 'number' && value >= 0 && value < 1) return Math.floor(value * 24); // fração do dia
  const s = String(value || '').trim();
  const m = s.match(/(\d{1,2}):\d{2}/) || s.match(/^(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}
/** Ordena os pontos pelo vizinho mais próximo, partindo do mais crítico. */
function orderRoute_(points) {
  if (points.length < 3) return points.slice();
  const rest = points.slice(1), out = [points[0]];
  while (rest.length) {
    const last = out[out.length - 1];
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => {
      const d = Math.pow(p.lat - last.lat, 2) + Math.pow((p.lng - last.lng) * Math.cos(last.lat * Math.PI / 180), 2);
      if (d < bd) { bd = d; bi = i; }
    });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}
function round_(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

/* ======================================================================= */
/*  Cache (divide em blocos para respeitar o limite de 100 KB por chave)   */
/* ======================================================================= */

function cacheSet_(name, obj) {
  try {
    const c = CacheService.getScriptCache();
    const json = JSON.stringify(obj), size = 90000, parts = Math.ceil(json.length / size);
    if (parts > 20) return;
    const data = {};
    for (let i = 0; i < parts; i++) data[CFG.CACHE_PREFIX + name + '_' + i] = json.substr(i * size, size);
    data[CFG.CACHE_PREFIX + name] = String(parts);
    c.putAll(data, CFG.CACHE_SECONDS);
  } catch (e) { /* cache é só otimização */ }
}
function cacheGet_(name) {
  try {
    const c = CacheService.getScriptCache();
    const parts = Number(c.get(CFG.CACHE_PREFIX + name));
    if (!parts) return null;
    const keys = []; for (let i = 0; i < parts; i++) keys.push(CFG.CACHE_PREFIX + name + '_' + i);
    const got = c.getAll(keys);
    let json = '';
    for (let i = 0; i < keys.length; i++) { if (got[keys[i]] == null) return null; json += got[keys[i]]; }
    return JSON.parse(json);
  } catch (e) { return null; }
}
