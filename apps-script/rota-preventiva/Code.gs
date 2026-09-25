/**
 * Rota Preventiva | Estado-Maior do CPE / PMRv (PMMG)
 *
 * Leitura da planilha baseada em CABEÇALHOS (e não em posição fixa de coluna).
 * Na versão anterior o script lia as colunas A:E da aba "Frações" (ou C:G da aba
 * "STV") às cegas; quando a planilha tinha outra ordem, os valores lidos eram
 * códigos (nº REDS, código IBGE...) que o filtro "sem códigos" descartava,
 * e os seletores ficavam vazios.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Rota Preventiva | Estado-Maior CPE / PMRv')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const CFG = {
  STV_SHEETS: ['STV', 'Base STV', 'Dados STV'],
  FRACTION_SHEETS: ['Frações', 'Fracoes', 'Fraçoes', 'Frações PMRv', 'Fracoes PMRv'],
  DICTIONARY_SHEETS: ['Mapa Frações', 'Mapa Fracoes', 'Dicionário', 'Dicionario'],
  CACHE_PREFIX: 'rota_preventiva_v7_',
  CACHE_SECONDS: 1800,
  HEADER_SCAN_ROWS: 6,
  SAMPLE_ROWS: 300,
  MAX_ROUTE_POINTS: 10,
  MAX_MAP_POINTS: 600
};

const TYPES = ['rpm', 'cia', 'pelotao', 'grupamento', 'cidade'];

/** Sinônimos aceitos no cabeçalho (comparados sem acento, minúsculos). */
const FIELD_ALIASES = {
  rpm: ['rpm', 'regiao', 'regiao policial', 'regiao da policia militar'],
  cia: ['cia', 'companhia', 'cia pmrv', 'companhia pmrv', 'cia rv'],
  pelotao: ['pelotao', 'pel', 'pel pmrv', 'pelotao pmrv'],
  grupamento: ['grupamento', 'gp', 'gp pmrv', 'grupamento pmrv', 'destacamento'],
  cidade: ['municipio', 'cidade', 'municipio cidade', 'localidade'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'long', 'lng', 'lon'],
  coord: ['coordenadas', 'coordenada', 'lat long', 'latlong', 'lat lng', 'geolocalizacao'],
  hora: ['hora', 'horario', 'hora fato', 'hora do fato', 'hora ocorrencia', 'data hora', 'data hora fato'],
  escore: ['escore', 'score', 'escore de risco', 'risco', 'indice de risco', 'peso'],
  rodovia: ['rodovia', 'br', 'via', 'rodovia km', 'trecho']
};
/** Palavras que indicam coluna de código/ID (usada só para montar dicionário). */
const CODE_WORDS = ['cod', 'codigo', 'id', 'num', 'numero', 'nr', 'n', 'ibge', 'sigla', 'reds', 'chave'];
/** Palavras que tornam a coluna preferencial como "nome por extenso". */
const NAME_WORDS = ['nome', 'descricao', 'desc', 'extenso'];

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
  // Nunca guarda em cache um resultado vazio: evita "travar" os filtros vazios por 30 min.
  const hasAny = TYPES.some(t => ctx.options[t].length);
  if (hasAny) cacheSet_('options', result);
  return result;
}

/** Filtra a base STV. Cada filtro é opcional e 100% independente dos demais. */
function calcularRotaAvancada(p) {
  p = p || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const labels = cacheGet_('labels') || loadContext_().labels;
  const stv = findSheet_(ss, CFG.STV_SHEETS);
  if (!stv) throw new Error('A aba "STV" não foi encontrada na planilha.');

  const table = readTable_(stv);
  const col = table.columns;
  if ((col.lat < 0 || col.lng < 0) && col.coord < 0) {
    throw new Error('Não encontrei as colunas de Latitude/Longitude na aba "' + stv.getName() +
      '". Cabeçalhos lidos: ' + table.headers.filter(String).join(', '));
  }

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

    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i];
      if (!selected[t]) continue;
      if (col[t] < 0 && table.codeColumns[t] < 0) return; // filtro escolhido, mas a base não tem essa coluna
      if (key_(cellName_(r, table, t, labels)) !== selected[t]) return;
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
    const city = cellName_(r, table, 'cidade', labels);
    const fraction = fractionName_(r, table, labels);
    const score = col.escore >= 0 ? number_(r[col.escore]) : null;
    // Agrupa pontos próximos (~110 m) na mesma rodovia/cidade.
    const k = [lat.toFixed(3), lng.toFixed(3), key_(road), key_(city)].join('|');
    let h = grouped[k];
    if (!h) h = grouped[k] = { sumLat: 0, sumLng: 0, rodovia: road, cidade: city, fracao: fraction, qtd: 0, total: 0, n: 0 };
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
  const c = CacheService.getScriptCache();
  c.removeAll(['options', 'labels'].map(k => CFG.CACHE_PREFIX + k));
}

/** Diagnóstico: rode pelo editor (Executar ▸ diagnosticarPlanilha) e veja o Log. */
function diagnosticarPlanilha() {
  limparCache();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];
  ss.getSheets().forEach(sh => {
    const t = readTable_(sh, CFG.SAMPLE_ROWS);
    const found = Object.keys(t.columns).filter(k => t.columns[k] >= 0)
      .map(k => k + '=' + t.headers[t.columns[k]]);
    report.push('Aba "' + sh.getName() + '" (cabeçalho na linha ' + t.headerRow + '): ' +
      (found.length ? found.join(' | ') : 'nenhuma coluna reconhecida'));
  });
  const ctx = loadContext_();
  TYPES.forEach(t => report.push(t.toUpperCase() + ': ' + ctx.options[t].length + ' opções → ' + ctx.options[t].slice(0, 8).join(', ')));
  ctx.warnings.forEach(w => report.push('AVISO: ' + w));
  Logger.log(report.join('\n'));
  return report;
}

/* ======================================================================= */
/*  Montagem das opções e do dicionário código → nome                      */
/* ======================================================================= */

function loadContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const warnings = [];
  const labels = {}; TYPES.forEach(t => labels[t] = Object.create(null));
  const optionSets = {}; TYPES.forEach(t => optionSets[t] = Object.create(null));
  const opaqueSamples = {}; TYPES.forEach(t => opaqueSamples[t] = []);
  const seenColumn = {}; TYPES.forEach(t => seenColumn[t] = false);

  // 1) Dicionário explícito: Tipo | Código | Nome oficial
  readDictionary_(ss).forEach(row => {
    const type = typeKey_(row[0]);
    const code = String(row[1] || '').trim();
    const name = String(row[2] || '').trim();
    if (type && code && name) labels[type][code] = friendly_(name, type);
  });

  // 2) Abas de hierarquia: Frações (se existir) e STV. Lê só as colunas necessárias.
  const sources = [findSheet_(ss, CFG.FRACTION_SHEETS), findSheet_(ss, CFG.STV_SHEETS)].filter(Boolean);
  if (!sources.length) warnings.push('Nenhuma aba "Frações" ou "STV" foi encontrada na planilha.');

  sources.forEach(sheet => {
    const t = readTable_(sheet, null, TYPES);
    TYPES.forEach(type => {
      const nameCol = t.columns[type], codeCol = t.codeColumns[type];
      if (nameCol < 0 && codeCol < 0) return;
      seenColumn[type] = true;
      t.rows.forEach(r => {
        const name = nameCol >= 0 ? String(r[nameCol] || '').trim() : '';
        const code = codeCol >= 0 ? String(r[codeCol] || '').trim() : '';
        if (name && !isOpaque_(name)) {
          const friendly = friendly_(name, type);
          labels[type][name] = friendly;
          if (code) labels[type][code] = friendly; // pareia código ↔ nome da mesma linha
          optionSets[type][key_(friendly)] = friendly;
        } else {
          const raw = name || code;
          if (!raw) return;
          const mapped = labels[type][raw];
          if (mapped) optionSets[type][key_(mapped)] = mapped;
          else if (opaqueSamples[type].length < 3 && opaqueSamples[type].indexOf(raw) < 0) opaqueSamples[type].push(raw);
        }
      });
    });
  });

  // Códigos que só aparecem numa aba, mas têm nome no dicionário/outra aba.
  TYPES.forEach(type => {
    opaqueSamples[type] = opaqueSamples[type].filter(code => {
      const mapped = labels[type][code];
      if (mapped) optionSets[type][key_(mapped)] = mapped;
      return !mapped;
    });
  });

  const nice = { rpm: 'RPM', cia: 'Companhia', pelotao: 'Pelotão', grupamento: 'Grupamento', cidade: 'Município' };
  const options = {};
  TYPES.forEach(type => {
    options[type] = Object.keys(optionSets[type]).map(k => optionSets[type][k]).sort(sortPt_);
    if (!seenColumn[type]) {
      warnings.push('Coluna de ' + nice[type] + ' não encontrada no cabeçalho das abas ' +
        sources.map(s => '"' + s.getName() + '"').join(' / ') + '.');
    } else if (!options[type].length && opaqueSamples[type].length) {
      warnings.push(nice[type] + ': a planilha só tem códigos (ex.: ' + opaqueSamples[type].join(', ') +
        '). Inclua uma coluna com o nome por extenso ou cadastre na aba "Mapa Frações" (Tipo | Código | Nome).');
    }
  });

  cacheSet_('labels', labels);
  return { labels: labels, options: options, warnings: warnings };
}

/** Nome amigável da célula; se a coluna de nome estiver vazia, traduz a coluna de código. */
function cellName_(r, table, type, labels) {
  const nameCol = table.columns[type], codeCol = table.codeColumns[type];
  const name = nameCol >= 0 ? displayName_(r[nameCol], type, labels[type]) : '';
  if (name || codeCol < 0) return name;
  return displayName_(r[codeCol], type, labels[type]);
}
function fractionName_(r, table, labels) {
  const parts = ['cia', 'pelotao', 'grupamento'].map(t => cellName_(r, table, t, labels)).filter(Boolean);
  return parts.join(' / ') || 'PMRv';
}

/* ======================================================================= */
/*  Leitura da planilha por cabeçalho                                      */
/* ======================================================================= */

/**
 * Lê uma aba identificando o cabeçalho automaticamente.
 * @param {Sheet} sheet
 * @param {number=} maxRows limita as linhas (diagnóstico)
 * @param {string[]=} onlyFields lê só as colunas desses campos (mais rápido)
 */
function readTable_(sheet, maxRows, onlyFields) {
  const empty = { headers: [], headerRow: 0, rows: [], columns: emptyColumns_(), codeColumns: emptyColumns_() };
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return empty;

  const scan = sheet.getRange(1, 1, Math.min(CFG.HEADER_SCAN_ROWS, lastRow), lastCol).getDisplayValues();
  let best = { row: 0, hits: -1, map: null };
  scan.forEach((hdr, i) => {
    const m = mapHeaders_(hdr);
    const hits = Object.keys(m.columns).filter(k => m.columns[k] >= 0 || m.codeColumns[k] >= 0).length;
    if (hits > best.hits) best = { row: i, hits: hits, map: m };
  });
  if (best.hits <= 0) return empty;

  const headers = scan[best.row];
  const firstData = best.row + 2;
  let nRows = lastRow - firstData + 1;
  if (maxRows) nRows = Math.min(nRows, maxRows);
  if (nRows < 1) return Object.assign(empty, { headers: headers, headerRow: best.row + 1, columns: best.map.columns, codeColumns: best.map.codeColumns });

  // Só lê o intervalo de colunas realmente necessário.
  let columns = best.map.columns, codeColumns = best.map.codeColumns;
  const wanted = [];
  Object.keys(columns).forEach(k => {
    if (onlyFields && onlyFields.indexOf(k) < 0) return;
    if (columns[k] >= 0) wanted.push(columns[k]);
    if (codeColumns[k] >= 0) wanted.push(codeColumns[k]);
  });
  if (!wanted.length) return Object.assign(empty, { headers: headers, headerRow: best.row + 1 });
  const minC = Math.min.apply(null, wanted), maxC = Math.max.apply(null, wanted);
  const rows = sheet.getRange(firstData, minC + 1, nRows, maxC - minC + 1).getValues();
  const shift = m => { const o = {}; Object.keys(m).forEach(k => o[k] = m[k] >= 0 ? m[k] - minC : -1); return o; };

  return {
    headers: headers.slice(minC, maxC + 1),
    headerRow: best.row + 1,
    rows: rows,
    columns: shift(columns),
    codeColumns: shift(codeColumns)
  };
}

/** Associa cada campo à melhor coluna do cabeçalho, separando colunas de nome e de código. */
function mapHeaders_(headerRow) {
  const columns = emptyColumns_(), codeColumns = emptyColumns_();
  const score = { }, codeScore = { };
  const fields = Object.keys(FIELD_ALIASES);
  const words = headerRow.map(h => key_(h).replace(/[^a-z0-9]+/g, ' ').trim());

  words.forEach((h, idx) => {
    if (!h) return;
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
    // "Data/Hora" não pode virar RPM etc.; e "Nº REDS" nunca é campo de hierarquia.
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
