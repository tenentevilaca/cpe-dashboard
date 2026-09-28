/**
 * Rota Preventiva | Estado-Maior do CPE / PMRv (PMMG)
 *
 * Origem dos dados
 *  - ARTICULACAO: frações (Cia / Pelotão / Grupamento), código de cada fração e
 *    municípios (sede e área de responsabilidade). O cruzamento pelo código
 *    define TODAS as cidades atendidas por cada fração.
 *  - STV: registros georreferenciados (latitude/longitude, data/hora, rodovia...).
 *  - Demais abas: lidas se tiverem RPM/Cia/Pel/Gp/Município (cabeçalho ou conteúdo).
 *  - BLOQUEIOS / ALERTAS (opcional) e feed Waze for Cities (opcional): interdições,
 *    acidentes e congestionamentos exibidos no mapa.
 *
 * Nomes na interface: apenas "01ª RPM", "01ª Cia PMRv", "01º Pelotão",
 * "01º Grupamento" e nomes de municípios. Códigos, "Sim/Não" e erros de célula
 * ("#######", "#N/A", "#REF!") nunca aparecem.
 */

function doGet(e) {
  // ?pagina=tutorial abre o manual (arquivo Tutorial.html); sem parâmetro, o aplicativo.
  const tutorial = e && e.parameter && String(e.parameter.pagina || '').toLowerCase() === 'tutorial';
  return HtmlService.createHtmlOutputFromFile(tutorial ? 'Tutorial' : 'Index')
    .setTitle(tutorial ? 'Manual da Rota Preventiva' : 'Rota Preventiva | Estado-Maior CPE / PMRv')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Endereço público do aplicativo (usado pelos links entre o app e o tutorial). */
function getUrlApp() {
  return ScriptApp.getService().getUrl();
}

const CFG = {
  STV_SHEETS: ['DADOS_STV', 'STV', 'Base STV', 'Dados STV'],
  PLANO_SHEETS: ['PLANO_RODOVIARIO', 'PLANO RODOVIARIO', 'Plano Rodoviário'],
  PLANO_CACHE: '_CACHE_PLANO',   // traçado calibrado de cada trecho do plano (aba oculta)
  TOL_MALHA_M: 300,              // distância máxima do acidente ao traçado para contar como "na malha"
  RAZAO_OK: [0.75, 1.35],        // comprimento do traçado ÷ extensão (Fim − Início) aceito na calibração
  ARTICULACAO_SHEETS: ['ARTICULACAO', 'ARTICULAÇÃO', 'Articulacao', 'Articulação'],
  ALERT_SHEETS: ['BLOQUEIOS', 'ALERTAS', 'INTERDICOES', 'INTERDIÇÕES'],
  DICTIONARY_SHEETS: ['Mapa Frações', 'Mapa Fracoes', 'Dicionário', 'Dicionario'],
  CACHE_PREFIX: 'rota_preventiva_v9_',
  CACHE_SECONDS: 1800,
  HEADER_SCAN_ROWS: 15,
  SAMPLE_ROWS: 300,
  MAX_CELLS: 12000,       // células de ~110 m enviadas ao mapa (reagrupadas no navegador)
  MAX_WAYPOINTS: 23,      // limite do Google Directions (Apps Script)
  W_RECENTE: 0.6,         // Ponderação Recente (w2026)
  W_HISTORICO: 0.4,
  UF: 'MG'
};

const TYPES = ['rpm', 'cia', 'pelotao', 'grupamento', 'cidade'];
const HIER = ['rpm', 'cia', 'pelotao', 'grupamento'];
const FRAC = ['cia', 'pelotao', 'grupamento'];
const JOIN = ' › ';

/** Sinônimos aceitos no cabeçalho (comparados sem acento, minúsculos, sem pontuação). */
const FIELD_ALIASES = {
  rpm: ['rpm', 'regiao', 'regiao policial', 'regiao da policia militar', 'regiao pm'],
  cia: ['cia', 'companhia', 'cia pmrv', 'companhia pmrv', 'cia rv', 'cias'],
  pelotao: ['pelotao', 'pel', 'pel pmrv', 'pelotao pmrv', 'pelotoes'],
  grupamento: ['grupamento', 'gp', 'gp pmrv', 'grupamento pmrv', 'destacamento', 'grupamentos'],
  cidade: ['municipio', 'cidade', 'municipio cidade', 'localidade', 'municipios', 'cidades',
           'municipio atendido', 'municipios atendidos', 'area de responsabilidade', 'mun', 'ibge'],
  sede: ['sede', 'municipio sede', 'cidade sede', 'sede da fracao'],
  fracao: ['fracao', 'fracao responsavel', 'unidade', 'unidade responsavel', 'ueop', 'subunidade',
           'lotacao', 'uop', 'fracao pmrv', 'unidade pmrv', 'hierarquia', 'responsavel', 'fracoes'],
  lat: ['latitude', 'lat', 'y', 'coord y'],
  lng: ['longitude', 'long', 'lng', 'lon', 'x', 'coord x'],
  coord: ['coordenadas', 'coordenada', 'lat long', 'latlong', 'lat lng', 'geolocalizacao'],
  data: ['data', 'data fato', 'data do fato', 'data ocorrencia', 'dt fato', 'dt', 'data hora', 'data hora fato'],
  hora: ['hora', 'horario', 'hora fato', 'hora do fato', 'hora ocorrencia', 'data hora', 'data hora fato'],
  escore: ['escore', 'score', 'escore de risco', 'risco', 'indice de risco', 'peso', 'gravidade'],
  rodovia: ['rodovia', 'br', 'via', 'rodovia km', 'trecho'],
  km: ['km', 'marco km', 'quilometro'],
  ini: ['inicio', 'km inicio', 'km inicial', 'inicio km', 'km ini'],
  fim: ['fim', 'km fim', 'km final', 'fim km'],
  extensao: ['extensao', 'extensao km', 'ext'],
  descIni: ['descricao inicio'],
  descFim: ['descricao fim'],
  latIni: ['lat inicio', 'latitude inicio', 'lat ini', 'lat inicial', 'latitude inicial'],
  lngIni: ['long inicio', 'longitude inicio', 'lon inicio', 'lng inicio', 'long ini', 'longitude inicial'],
  latFim: ['lat fim', 'latitude fim', 'lat final', 'latitude final'],
  lngFim: ['long fim', 'longitude fim', 'lon fim', 'lng fim', 'longitude final'],
  situacao: ['situacao'],
  tipo: ['tipo', 'natureza', 'tipo alerta', 'categoria'],
  descricao: ['descricao', 'observacao', 'obs', 'detalhe', 'historico']
};
const CODE_WORDS = ['cod', 'codigo', 'id', 'num', 'numero', 'nr', 'n', 'ibge', 'sigla', 'reds', 'chave'];
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

/** Opções dos seletores em forma de "tuplas" [RPM, Cia, Pel, Gp, Município, Sede] para a cascata. */
function getDadosCompletosFiltros() {
  const cached = cacheGet_('options');
  if (cached) return cached;
  const ctx = loadContext_();
  const result = {
    tuplas: ctx.tuples,
    rpms: ctx.options.rpm, cias: ctx.options.cia, pelotoes: ctx.options.pelotao,
    grupamentos: ctx.options.grupamento, cidades: ctx.options.cidade,
    pesos: { recente: CFG.W_RECENTE, historico: CFG.W_HISTORICO },
    avisos: ctx.warnings,
    leitura: ctx.sheetsInfo
  };
  if (!ctx.warnings.length) cacheSet_('options', result);
  return result;
}

/**
 * Filtra a base STV e devolve células de ~110 m já agregadas. O navegador reagrupa
 * essas células conforme a régua de densidade, sem nova consulta à planilha.
 */
function calcularRotaAvancada(p) {
  p = p || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = cacheGet_('ctx') || loadContext_();
  const found = findStvTable_(ss, ctx.codeToFrac);
  if (!found) throw new Error('Não encontrei a base STV: nenhuma aba tem colunas de Latitude/Longitude (ou "Coordenadas").');
  const table = found.table, col = table.columns;
  const tz = ss.getSpreadsheetTimeZone();

  const sel = {
    rpm: selectedKey_(p.rpm), cia: selectedKey_(p.cia), pelotao: selectedKey_(p.pelotao),
    grupamento: selectedKey_(p.grupamento), cidade: selectedKey_(p.cidade)
  };
  const fracFilter = !!(sel.cia || sel.pelotao || sel.grupamento);
  const sedeLevel = sel.grupamento ? 'grupamento' : sel.pelotao ? 'pelotao' : 'cia';
  const from = finite_(p.horaInicio), to = finite_(p.horaFim), useHours = from !== null && to !== null;

  // Data de referência da ponderação recente: hoje; se a base for mais antiga, o registro mais recente.
  let maxDate = 0;
  if (col.data >= 0) table.rows.forEach(r => { const d = parseDate_(r[col.data]); if (d && d > maxDate) maxDate = d; });
  const today = Date.now();
  let ref = today, refAjustada = false;
  if (maxDate && maxDate < today - 90 * 864e5) { ref = maxDate; refAjustada = true; }

  const cells = Object.create(null), sedes = Object.create(null);
  const box = { s: 90, n: -90, w: 180, e: -180 };
  let total = 0, minDate = 0;
  // Eventos individuais (célula, dia, hora) para o treino dos modelos no navegador.
  const tzOff = new Date(ref).getTimezoneOffset() * 60000;
  const dayOf = ms => Math.floor((ms - tzOff) / 864e5);
  const evKey = [], evDay = [], evHour = [];

  table.rows.forEach(r => {
    let lat, lng;
    if (col.lat >= 0 && col.lng >= 0) { lat = coord_(r[col.lat], 90); lng = coord_(r[col.lng], 180); }
    else { const c = splitCoord_(r[col.coord]); lat = c[0]; lng = c[1]; }
    if (lat === null || lng === null || (lat === 0 && lng === 0)) return;

    const v = rowOwn_(r, table, ctx);
    const city = v.cidade ? ctx.cities[key_(v.cidade)] : null;
    const rpm = v.rpm || (city ? city.rpm || city.rpmFrac : '') || '';
    if (sel.rpm && key_(rpm) !== sel.rpm) return;
    if (sel.cidade && key_(v.cidade) !== sel.cidade) return;
    const cands = candidates_(v, city);
    let frac = null;
    if (fracFilter) { frac = cands.find(f => matchFrac_(f, sel)); if (!frac) return; }
    else frac = cands[0] || null;

    let hour = null;
    if (col.hora >= 0) hour = getHour_(r[col.hora], tz);
    if (useHours && hour !== null && !inWindow_(hour, from, to)) return;

    total++;
    box.s = Math.min(box.s, lat); box.n = Math.max(box.n, lat);
    box.w = Math.min(box.w, lng); box.e = Math.max(box.e, lng);

    const k = lat.toFixed(3) + ',' + lng.toFixed(3);
    let c = cells[k];
    if (!c) c = cells[k] = { key: k, la: 0, lo: 0, n: 0, s: 0, sn: 0, r: [0, 0, 0, 0, 0], h: null, w: null, rd: '', ci: '', fr: '', sd: '', km: null, ul: 0 };
    c.la += lat; c.lo += lng; c.n++;
    const sev = col.escore >= 0 ? number_(r[col.escore]) : null;
    if (sev !== null) { c.s += sev; c.sn++; }
    if (hour !== null) { if (!c.h) c.h = new Array(24).fill(0); c.h[hour]++; }
    const d = col.data >= 0 ? parseDate_(r[col.data]) : null;
    if (d) { evKey.push(k); evDay.push(dayOf(d)); evHour.push(hour === null ? -1 : hour); }
    if (d) {
      const age = (ref - d) / 864e5;
      if (age <= 30) c.r[0]++;
      if (age <= 60) c.r[1]++;
      if (age <= 90) c.r[2]++;
      if (age > 90 && age <= 180) c.r[3]++;   // trimestre anterior (tendência)
      if (age <= 365) c.r[4]++;
      if (!c.w) c.w = [0, 0, 0, 0, 0, 0, 0];
      c.w[new Date(d).getDay()]++;
      if (d > c.ul) c.ul = d;
      if (!minDate || d < minDate) minDate = d;
    }
    if (!c.rd && col.rodovia >= 0) c.rd = String(r[col.rodovia] || '').trim();
    if (!c.ci) c.ci = v.cidade || '';
    if (!c.fr && frac) { c.fr = fracLabel_(frac); c.sd = frac.sede || ''; }
    if (col.km >= 0) {
      const km = number_(r[col.km]);
      if (km !== null) c.km = c.km ? [Math.min(c.km[0], km), Math.max(c.km[1], km)] : [km, km];
    }
    const sd = frac ? (frac.sedes && frac.sedes[sedeLevel]) || frac.sede : '';
    if (sd) sedes[sd] = (sedes[sd] || 0) + 1;
  });

  const lin = linearRef_(ss, ctx);
  const out = Object.keys(cells).map(k => {
    const c = cells[k];
    c.la = round_(c.la / c.n, 6); c.lo = round_(c.lo / c.n, 6);
    c.ul = c.ul ? Utilities.formatDate(new Date(c.ul), tz, 'dd/MM/yyyy') : '';
    if (lin.segs.length) {
      // Km do acidente: projeção da coordenada sobre o traçado calibrado do plano rodoviário.
      const m = lin.match(c.la, c.lo);
      if (m) { c.rd = m.rod; c.km = [m.km, m.km]; c.mr = 1; c.sf = m.fr; c.dm = m.dist; }
      else c.mr = 0;
    }
    return c;
  }).sort((a, b) => b.n - a.n).slice(0, CFG.MAX_CELLS);
  const idx = {};
  out.forEach((c, i) => { idx[c.key] = i; delete c.key; });
  const ev = [];   // [índice da célula, dia (dias desde 1970, horário local), hora ou -1] em sequência
  for (let i = 0; i < evKey.length; i++) { const ci = idx[evKey[i]]; if (ci !== undefined) ev.push(ci, evDay[i], evHour[i]); }

  // Origem sugerida: sede da fração filtrada (ou o município escolhido).
  let sedeNome = '';
  if (fracFilter) sedeNome = Object.keys(sedes).sort((a, b) => sedes[b] - sedes[a])[0] || '';
  if (!sedeNome && sel.cidade) sedeNome = String(p.cidade || '');
  const origemSede = sedeNome ? geocode_(sedeNome) : null;
  const malha = planoSegments_(ss, ctx, sel, fracFilter);

  return {
    cells: out,
    bounds: total ? [[box.s, box.w], [box.n, box.e]] : null,
    totalRegistros: total,
    referencia: Utilities.formatDate(new Date(ref), tz, 'dd/MM/yyyy'),
    referenciaAjustada: refAjustada,
    diasBase: minDate ? Math.max(1, Math.round((ref - minDate) / 864e5)) : null,
    ev: ev,
    diaRef: dayOf(ref),
    temHora: col.hora >= 0, temData: col.data >= 0, temEscore: col.escore >= 0,
    origemSede: origemSede,
    malha: malha,
    calibracao: lin.info,
    pesos: { recente: CFG.W_RECENTE, historico: CFG.W_HISTORICO }
  };
}

/* ======================================================================= */
/*  Clima (Open-Meteo: gratuito, sem cadastro, uso não comercial)           */
/* ======================================================================= */

/**
 * Chuva horária histórica e previsão dos próximos 7 dias para até 6 pontos da área.
 * req = { pontos: [{lat,lng}], inicio: 'aaaa-mm-dd', fim: 'aaaa-mm-dd' }
 * Retorno por ponto: horas com chuva (índice da hora desde o início, mm×10) e previsão horária.
 */
function analisarClima(req) {
  req = req || {};
  const pts = (req.pontos || []).slice(0, 6);
  if (!pts.length || !req.inicio || !req.fim) return { ok: false, motivo: 'Parâmetros ausentes' };
  const cacheKey = 'clima_' + digest_(JSON.stringify(req));
  const hit = cacheGet_(cacheKey);
  if (hit) return hit;
  const tz = encodeURIComponent('America/Sao_Paulo');
  const reqs = [];
  pts.forEach(p => {
    const ll = 'latitude=' + Number(p.lat).toFixed(3) + '&longitude=' + Number(p.lng).toFixed(3);
    reqs.push({ url: 'https://archive-api.open-meteo.com/v1/archive?' + ll + '&start_date=' + req.inicio + '&end_date=' + req.fim + '&hourly=precipitation&timezone=' + tz, muteHttpExceptions: true });
    reqs.push({ url: 'https://api.open-meteo.com/v1/forecast?' + ll + '&hourly=precipitation,precipitation_probability&forecast_days=7&timezone=' + tz, muteHttpExceptions: true });
  });
  let res;
  try { res = UrlFetchApp.fetchAll(reqs); }
  catch (e) { return { ok: false, motivo: 'Open-Meteo indisponível: ' + (e.message || e) }; }
  const out = { ok: true, inicio: req.inicio, fim: req.fim, pontos: [] };
  for (let i = 0; i < pts.length; i++) {
    const hist = safeJson_(res[2 * i]), prev = safeJson_(res[2 * i + 1]);
    const item = { lat: pts[i].lat, lng: pts[i].lng, chuva: [], horas: 0, previsao: null };
    if (hist && hist.hourly && hist.hourly.precipitation) {
      const pr = hist.hourly.precipitation;
      item.horas = pr.length;
      for (let h = 0; h < pr.length; h++) if (pr[h] >= 0.1) item.chuva.push(h, Math.round(pr[h] * 10));
      item.inicioHist = hist.hourly.time && hist.hourly.time[0];
    } else item.erro = (hist && hist.reason) || 'sem histórico';
    if (prev && prev.hourly) item.previsao = { inicio: prev.hourly.time && prev.hourly.time[0], mm: prev.hourly.precipitation || [], prob: prev.hourly.precipitation_probability || [] };
    out.pontos.push(item);
  }
  if (!out.pontos.some(p => p.horas)) return { ok: false, motivo: out.pontos.map(p => p.erro).filter(Boolean)[0] || 'sem dados' };
  cacheSet_(cacheKey, out, 21600);
  return out;
}
function safeJson_(resp) {
  try { return resp.getResponseCode() === 200 ? JSON.parse(resp.getContentText()) : JSON.parse(resp.getContentText() || 'null'); }
  catch (e) { return null; }
}

/**
 * Identifica a rodovia de cada ponto (geocodificação reversa do Google), já que a base
 * STV não traz rodovia. Resultado guardado na aba oculta _CACHE_RODOVIAS para poupar cota.
 * pts = [{id, lat, lng}] → { id: {rodovia, local} }
 */
function identificarRodovias(pts) {
  pts = (pts || []).slice(0, 60);
  const store = geoStore_(), out = {}, novos = [];
  pts.forEach(p => {
    const k = Number(p.lat).toFixed(3) + ',' + Number(p.lng).toFixed(3);
    let v = store.map[k];
    if (!v) {
      try { v = parseRoad_(Maps.newGeocoder().setLanguage('pt-BR').setRegion('br').reverseGeocode(p.lat, p.lng)); }
      catch (e) { v = null; }
      if (v) { store.map[k] = v; novos.push([k, v.rodovia, v.local]); }
    }
    if (v) out[p.id] = v;
  });
  if (novos.length && store.sheet) {
    try { store.sheet.getRange(store.sheet.getLastRow() + 1, 1, novos.length, 3).setValues(novos); } catch (e) { /* sem permissão de escrita */ }
  }
  return out;
}
function geoStore_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('_CACHE_RODOVIAS');
  try {
    if (!sh) { sh = ss.insertSheet('_CACHE_RODOVIAS'); sh.getRange(1, 1, 1, 3).setValues([['chave', 'via', 'local']]); sh.hideSheet(); }
  } catch (e) { sh = null; }
  const map = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(r => { map[r[0]] = { rodovia: String(r[1] || ''), local: String(r[2] || '') }; });
  return { sheet: sh, map: map };
}
function parseRoad_(res) {
  if (!res || res.status !== 'OK' || !res.results) return null;
  let road = '', local = '';
  res.results.forEach(r => (r.address_components || []).forEach(c => {
    const txt = (c.short_name || '') + ' ' + (c.long_name || '');
    if (c.types.indexOf('route') >= 0) {
      const m = txt.match(/\b(BR|MG|LMG|AMG|MGC)[- ]?(\d{2,3})\b/i);
      if (m && !/^(BR|MG|LMG|AMG|MGC)-/.test(road)) road = m[1].toUpperCase() + '-' + m[2];
      else if (!road) road = c.short_name || c.long_name;
    }
    if (!local && c.types.indexOf('administrative_area_level_2') >= 0) local = c.long_name;
  }));
  return { rodovia: road, local: local };
}

/* ======================================================================= */
/*  Referência linear: km de cada acidente a partir do PLANO_RODOVIARIO     */
/* ======================================================================= */

/** Todos os trechos do plano (sem filtro), com a fração responsável e a chave de calibração. */
function planoRows_(ss, ctx) {
  const sh = findSheet_(ss, CFG.PLANO_SHEETS);
  if (!sh) return [];
  const t = readTable_(sh), c = t.columns;
  if (c.rodovia < 0 || c.ini < 0 || c.fim < 0) return [];
  const out = [];
  t.rows.forEach(r => {
    const rod = String(r[c.rodovia] || '').trim();
    const ini = number_(r[c.ini]), fim = number_(r[c.fim]);
    if (!rod || isJunk_(rod) || ini === null || fim === null || ini === fim) return;
    const v = rowOwn_(r, t, ctx);
    const city = v.cidade ? ctx.cities[key_(v.cidade)] : null;
    const frac = candidates_(v, city)[0] || null;
    const pt = (a, b) => { const la = a >= 0 ? coord_(r[a], 90) : null, lo = b >= 0 ? coord_(r[b], 180) : null; return la !== null && lo !== null ? [la, lo] : null; };
    out.push({
      key: [key_(rod).replace(/[^a-z0-9]/g, ''), ini, fim, key_(v.cidade)].join('|'),
      rod: rod, ini: ini, fim: fim, mun: v.cidade || '', fr: frac ? fracLabel_(frac) : '',
      di: c.descIni >= 0 ? String(r[c.descIni] || '').trim() : '',
      df: c.descFim >= 0 ? String(r[c.descFim] || '').trim() : '',
      a: pt(c.latIni, c.lngIni), b: pt(c.latFim, c.lngFim)
    });
  });
  return out;
}

function planoCache_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.PLANO_CACHE);
  if (!sh) {
    try {
      sh = ss.insertSheet(CFG.PLANO_CACHE);
      sh.getRange(1, 1, 1, 7).setValues([['chave', 'via', 'origem', 'status', 'razao', 'comprimento_m', 'polyline']]);
      sh.hideSheet();
    } catch (e) { return { sheet: null, map: {}, rowOf: {} }; }
  }
  const map = {}, rowOf = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach((r, i) => {
    map[r[0]] = { status: String(r[3]), razao: Number(r[4]), len: Number(r[5]), poly: String(r[6] || ''), origem: String(r[2]) };
    rowOf[r[0]] = i + 2;
  });
  return { sheet: sh, map: map, rowOf: rowOf };
}

/**
 * Calibra o PLANO_RODOVIARIO: para cada trecho, localiza início e fim (coordenadas das
 * colunas Lat/Long Início/Fim, se existirem; senão, pela Descrição Início/Fim + município),
 * pede ao Google o traçado viário entre eles e confere o comprimento com Fim − Início.
 * Roda por até ~4,5 min e agenda a continuação sozinha. Execute pelo editor (ou pelo botão no app).
 */
function calibrarPlanoRodoviario(refazer) {
  const t0 = Date.now(), ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = cacheGet_('ctx') || loadContext_();
  const rows = planoRows_(ss, ctx);
  if (!rows.length) return { ok: false, motivo: 'PLANO_RODOVIARIO sem colunas Rodovia, Início e Fim.' };
  const cache = planoCache_();
  if (!cache.sheet) return { ok: false, motivo: 'Sem permissão para criar a aba ' + CFG.PLANO_CACHE + '.' };
  let feitos = 0, pendentes = 0;
  const seen = {};
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    if (seen[s.key]) continue; seen[s.key] = 1;
    const prev = cache.map[s.key];
    if (prev && (prev.status === 'ok' || (refazer !== true && prev.status))) continue;
    if (Date.now() - t0 > 270000) { pendentes++; continue; }
    const res = calibrarTrecho_(s);
    const line = [s.key, s.rod, res.origem, res.status, res.razao, res.len, res.poly];
    if (cache.rowOf[s.key]) cache.sheet.getRange(cache.rowOf[s.key], 1, 1, 7).setValues([line]);
    else { cache.sheet.appendRow(line); cache.rowOf[s.key] = cache.sheet.getLastRow(); }
    feitos++;
  }
  // Continua sozinho em 1 minuto se faltou tempo.
  try {
    ScriptApp.getProjectTriggers().filter(tr => tr.getHandlerFunction() === 'calibrarPlanoRodoviario').forEach(tr => ScriptApp.deleteTrigger(tr));
    if (pendentes) ScriptApp.newTrigger('calibrarPlanoRodoviario').timeBased().after(60000).create();
  } catch (e) { /* sem permissão de gatilho: basta executar de novo */ }
  const resumo = resumoCalibracao_(rows, planoCache_().map);
  resumo.feitosAgora = feitos; resumo.pendentes = pendentes;
  Logger.log(JSON.stringify(resumo));
  return resumo;
}

function calibrarTrecho_(s) {
  const out = { origem: '', status: '', razao: '', len: '', poly: '' };
  try {
    let a = s.a, b = s.b;
    out.origem = a && b ? 'coordenadas' : 'descrição';
    const geo = txt => {
      if (!txt) return null;
      const q = [s.rod + ' ' + txt, txt].map(x => x + (s.mun ? ', ' + s.mun : '') + ', ' + CFG.UF + ', Brasil');
      for (let i = 0; i < q.length; i++) {
        const r = Maps.newGeocoder().setRegion('br').setLanguage('pt-BR').geocode(q[i]);
        if (r.status === 'OK' && r.results.length) { const l = r.results[0].geometry.location; return [l.lat, l.lng]; }
      }
      return null;
    };
    if (!a) a = geo(s.di);
    if (!b) b = geo(s.df);
    if (!a || !b) { out.status = 'falha: início/fim não localizados'; return out; }
    const res = Maps.newDirectionFinder().setRegion('br').setMode(Maps.DirectionFinder.Mode.DRIVING)
      .setOrigin(a[0], a[1]).setDestination(b[0], b[1]).getDirections();
    if (!res || res.status !== 'OK' || !res.routes.length) { out.status = 'falha: sem traçado (' + (res && res.status) + ')'; return out; }
    const rt = res.routes[0];
    const len = rt.legs.reduce((x, l) => x + l.distance.value, 0);
    const razao = len / (Math.abs(s.fim - s.ini) * 1000);
    out.len = len; out.razao = round_(razao, 2); out.poly = rt.overview_polyline.points;
    out.status = razao >= CFG.RAZAO_OK[0] && razao <= CFG.RAZAO_OK[1] ? 'ok' : 'revisar';
  } catch (e) { out.status = 'falha: ' + (e.message || e); }
  return out;
}

function resumoCalibracao_(rows, map) {
  const r = { trechos: 0, ok: 0, revisar: 0, falha: 0, semCalibrar: 0 };
  const seen = {};
  rows.forEach(s => {
    if (seen[s.key]) return; seen[s.key] = 1; r.trechos++;
    const m = map[s.key];
    if (!m || !m.status) r.semCalibrar++;
    else if (m.status === 'ok') r.ok++;
    else if (m.status === 'revisar') r.revisar++;
    else r.falha++;
  });
  return r;
}

/** Monta o índice espacial dos trechos calibrados ("ok") e a função de projeção ponto → km. */
function linearRef_(ss, ctx) {
  const rows = planoRows_(ss, ctx);
  const empty = { segs: [], match: () => null, info: null };
  if (!rows.length) return empty;
  const cache = planoCache_();
  const info = resumoCalibracao_(rows, cache.map);
  const segs = [], grid = {}, G = 0.01, pad = CFG.TOL_MALHA_M / 111320;
  const seen = {};
  rows.forEach(s => {
    const m = cache.map[s.key];
    if (seen[s.key] || !m || m.status !== 'ok' || !m.poly) return;
    seen[s.key] = 1;
    const pts = pairs_(Maps.decodePolyline(m.poly));
    if (pts.length < 2) return;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM_(pts[i - 1], pts[i]));
    const seg = { rod: s.rod, ini: s.ini, fim: s.fim, fr: s.fr, pts: pts, cum: cum, len: cum[cum.length - 1] };
    const si = segs.push(seg) - 1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const la0 = Math.min(pts[i][0], pts[i + 1][0]) - pad, la1 = Math.max(pts[i][0], pts[i + 1][0]) + pad;
      const lo0 = Math.min(pts[i][1], pts[i + 1][1]) - pad, lo1 = Math.max(pts[i][1], pts[i + 1][1]) + pad;
      for (let y = Math.floor(la0 / G); y <= Math.floor(la1 / G); y++)
        for (let x = Math.floor(lo0 / G); x <= Math.floor(lo1 / G); x++) (grid[y + ':' + x] = grid[y + ':' + x] || []).push([si, i]);
    }
  });
  info.malhaKm = round_(segs.reduce((a, s) => a + Math.abs(s.fim - s.ini), 0), 1);
  const match = (lat, lng) => {
    const cand = grid[Math.floor(lat / G) + ':' + Math.floor(lng / G)];
    if (!cand) return null;
    let best = null;
    cand.forEach(([si, i]) => {
      const s = segs[si], p = projM_([lat, lng], s.pts[i], s.pts[i + 1]);
      if (p.d <= CFG.TOL_MALHA_M && (!best || p.d < best.d)) best = { s: s, i: i, t: p.t, d: p.d };
    });
    if (!best) return null;
    const s = best.s, along = s.cum[best.i] + best.t * (s.cum[best.i + 1] - s.cum[best.i]);
    const km = s.ini + (s.fim - s.ini) * (s.len ? along / s.len : 0);  // escala para a extensão oficial do plano
    return { rod: s.rod, km: round_(km, 1), fr: s.fr, dist: Math.round(best.d) };
  };
  return { segs: segs, match: match, info: info };
}
function distM_(a, b) {
  const cos = Math.cos(a[0] * Math.PI / 180), dy = (b[0] - a[0]) * 111320, dx = (b[1] - a[1]) * 111320 * cos;
  return Math.sqrt(dx * dx + dy * dy);
}
/** Projeção de p no segmento a→b (metros): distância e fração t do segmento. */
function projM_(p, a, b) {
  const cos = Math.cos(a[0] * Math.PI / 180);
  const bx = (b[1] - a[1]) * 111320 * cos, by = (b[0] - a[0]) * 111320;
  const px = (p[1] - a[1]) * 111320 * cos, py = (p[0] - a[0]) * 111320;
  const L2 = bx * bx + by * by;
  const t = L2 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
  const dx = px - t * bx, dy = py - t * by;
  return { t: t, d: Math.sqrt(dx * dx + dy * dy) };
}

/** Trechos do PLANO_RODOVIARIO sob responsabilidade da área filtrada. */
function planoSegments_(ss, ctx, sel, fracFilter) {
  const sh = findSheet_(ss, CFG.PLANO_SHEETS);
  if (!sh) return [];
  const t = readTable_(sh), c = t.columns;
  if (c.rodovia < 0) return [];
  const out = [];
  t.rows.forEach(r => {
    const v = rowOwn_(r, t, ctx);
    const city = v.cidade ? ctx.cities[key_(v.cidade)] : null;
    const rpm = v.rpm || (city ? city.rpm || city.rpmFrac : '') || '';
    if (sel.rpm && key_(rpm) !== sel.rpm) return;
    if (sel.cidade && key_(v.cidade) !== sel.cidade) return;
    const cands = candidates_(v, city);
    let frac = cands[0] || null;
    if (fracFilter) { frac = cands.find(f => matchFrac_(f, sel)); if (!frac) return; }
    const rod = String(r[c.rodovia] || '').trim();
    if (!rod || isJunk_(rod)) return;
    const ini = c.ini >= 0 ? number_(r[c.ini]) : null, fim = c.fim >= 0 ? number_(r[c.fim]) : null;
    let ext = c.extensao >= 0 ? number_(r[c.extensao]) : null;
    if (ext === null && ini !== null && fim !== null) ext = Math.abs(fim - ini);
    out.push({
      rod: rod, ini: ini, fim: fim, ext: ext !== null ? round_(ext, 1) : null,
      di: c.descIni >= 0 ? String(r[c.descIni] || '').trim() : '',
      df: c.descFim >= 0 ? String(r[c.descFim] || '').trim() : '',
      mun: v.cidade || '', fr: frac ? fracLabel_(frac) : '',
      sit: c.situacao >= 0 ? String(r[c.situacao] || '').trim() : ''
    });
  });
  return out.slice(0, 800);
}

/**
 * Traçado viário da rota preventiva (Google Directions, dentro do app).
 * req = { origem: {lat,lng,nome}|null, pontos: [{id,lat,lng}], retornar: bool }
 */
function calcularTrajeto(req) {
  req = req || {};
  const pts = (req.pontos || []).slice(0, CFG.MAX_WAYPOINTS + 1);
  if (!pts.length) return { ok: false, motivo: 'Sem pontos' };
  const cacheKey = 'dir_' + digest_(JSON.stringify(req));
  const hit = cacheGet_(cacheKey);
  if (hit) return hit;
  try {
    const df = Maps.newDirectionFinder().setLanguage('pt-BR').setRegion('br')
      .setMode(Maps.DirectionFinder.Mode.DRIVING);
    const rest = pts.slice();
    const origin = req.origem && isFinite(req.origem.lat) ? req.origem : null;
    const first = origin ? null : rest.shift();
    const o = origin || first;
    df.setOrigin(o.lat, o.lng);
    let last = null;
    if (origin && req.retornar) df.setDestination(origin.lat, origin.lng);
    else if (rest.length) { last = rest.pop(); df.setDestination(last.lat, last.lng); }
    else df.setDestination(o.lat, o.lng);
    rest.slice(0, CFG.MAX_WAYPOINTS).forEach(p => df.addWaypoint(p.lat, p.lng));
    if (rest.length > 1) df.setOptimizeWaypoints(true);
    const res = df.getDirections();
    if (!res || res.status !== 'OK' || !res.routes || !res.routes.length) return { ok: false, motivo: res && res.status };
    const route = res.routes[0];
    const order = route.waypoint_order || rest.map((_, i) => i);
    const seq = [];
    if (first) seq.push(first.id);
    order.forEach(i => seq.push(rest[i].id));
    if (last) seq.push(last.id);
    const out = {
      ok: true,
      sequencia: seq,
      path: pairs_(Maps.decodePolyline(route.overview_polyline.points)),
      legs: route.legs.map(l => ({
        km: round_(l.distance.value / 1000, 1), min: Math.round(l.duration.value / 60),
        passos: (l.steps || []).slice(0, 40).map(s => ({ txt: stripHtml_(s.html_instructions), km: round_(s.distance.value / 1000, 1) }))
      })),
      resumo: route.summary || '',
      avisos: route.warnings || []
    };
    out.km = round_(out.legs.reduce((a, l) => a + l.km, 0), 1);
    out.min = out.legs.reduce((a, l) => a + l.min, 0);
    cacheSet_(cacheKey, out, 21600);
    return out;
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

/** Rotas de acesso (principal + alternativas) da origem até um ponto: atendimento a acidente. */
function rotasAcesso(req) {
  req = req || {};
  const o = req.origem, d = req.destino;
  if (!o || !d) return { ok: false, motivo: 'Origem ou destino ausente' };
  const cacheKey = 'alt_' + digest_(JSON.stringify(req));
  const hit = cacheGet_(cacheKey);
  if (hit) return hit;
  try {
    const df = Maps.newDirectionFinder().setLanguage('pt-BR').setRegion('br')
      .setMode(Maps.DirectionFinder.Mode.DRIVING).setAlternatives(true);
    if (isFinite(o.lat)) df.setOrigin(o.lat, o.lng); else df.setOrigin(String(o.nome) + ', ' + CFG.UF + ', Brasil');
    df.setDestination(d.lat, d.lng);
    const res = df.getDirections();
    if (!res || res.status !== 'OK') return { ok: false, motivo: res && res.status };
    const out = {
      ok: true,
      rotas: res.routes.slice(0, 3).map(rt => ({
        via: rt.summary || '',
        km: round_(rt.legs.reduce((a, l) => a + l.distance.value, 0) / 1000, 1),
        min: Math.round(rt.legs.reduce((a, l) => a + l.duration.value, 0) / 60),
        path: pairs_(Maps.decodePolyline(rt.overview_polyline.points)),
        avisos: rt.warnings || []
      }))
    };
    cacheSet_(cacheKey, out, 21600);
    return out;
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

/**
 * Bloqueios, estrangulamentos, acidentes e congestionamentos dentro da área.
 * Fontes: aba BLOQUEIOS/ALERTAS (manual) e, se configurado, o feed do Waze for Cities
 * (Propriedades do script ▸ WAZE_FEED_URL).
 */
function getAlertasVia(bounds) {
  const inBox = (lat, lng) => !bounds || (lat >= bounds[0][0] - 0.2 && lat <= bounds[1][0] + 0.2 &&
    lng >= bounds[0][1] - 0.2 && lng <= bounds[1][1] + 0.2);
  const out = { alertas: [], congestionamentos: [], fontes: [] };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheet_(ss, CFG.ALERT_SHEETS);
  if (sheet) {
    const t = readTable_(sheet);
    const c = t.columns;
    t.rows.forEach(r => {
      let lat = null, lng = null;
      if (c.lat >= 0 && c.lng >= 0) { lat = coord_(r[c.lat], 90); lng = coord_(r[c.lng], 180); }
      else if (c.coord >= 0) { const x = splitCoord_(r[c.coord]); lat = x[0]; lng = x[1]; }
      if (lat == null || lng == null || !inBox(lat, lng)) return;
      out.alertas.push({
        lat: lat, lng: lng,
        tipo: c.tipo >= 0 ? String(r[c.tipo] || '').trim() : 'Alerta',
        desc: c.descricao >= 0 ? String(r[c.descricao] || '').trim() : '',
        via: c.rodovia >= 0 ? String(r[c.rodovia] || '').trim() : '',
        fonte: 'Planilha'
      });
    });
    out.fontes.push('aba ' + sheet.getName());
  }
  const url = PropertiesService.getScriptProperties().getProperty('WAZE_FEED_URL');
  if (url) {
    try {
      const feed = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      (feed.alerts || []).forEach(a => {
        const lat = a.location && a.location.y, lng = a.location && a.location.x;
        if (!isFinite(lat) || !inBox(lat, lng)) return;
        out.alertas.push({ lat: lat, lng: lng, tipo: wazeType_(a.type, a.subtype),
          desc: a.reportDescription || '', via: a.street || '', fonte: 'Waze' });
      });
      (feed.jams || []).forEach(j => {
        const path = (j.line || []).map(p => [p.y, p.x]);
        if (!path.length || !inBox(path[0][0], path[0][1])) return;
        out.congestionamentos.push({ path: path, via: j.street || '', nivel: j.level || 0,
          atrasoMin: Math.round((j.delay || 0) / 60), km: round_((j.length || 0) / 1000, 1) });
      });
      out.fontes.push('Waze for Cities');
    } catch (e) { out.fontes.push('Waze indisponível (' + (e.message || e) + ')'); }
  }
  return out;
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
  TYPES.forEach(t => report.push(t.toUpperCase() + ': ' + ctx.options[t].length + ' opções → ' + ctx.options[t].slice(0, 12).join(', ')));
  report.push('Municípios com fração vinculada: ' + Object.keys(ctx.cities).filter(k => Object.keys(ctx.cities[k].fracs).length).length);
  report.push('Frações com código: ' + Object.keys(ctx.codeToFrac).length);
  const rows = planoRows_(SpreadsheetApp.getActiveSpreadsheet(), ctx);
  if (rows.length) { const c = resumoCalibracao_(rows, planoCache_().map); report.push('Plano rodoviário: ' + c.trechos + ' trechos · calibrados ' + c.ok + ' · revisar ' + c.revisar + ' · falha ' + c.falha + ' · sem calibrar ' + c.semCalibrar); }
  ctx.warnings.forEach(w => report.push('AVISO: ' + w));
  Logger.log(report.join('\n'));
  return report;
}

/* ======================================================================= */
/*  Contexto: dicionário, ARTICULACAO, município → frações                 */
/* ======================================================================= */

function loadContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const warnings = [], sheetsInfo = [];
  const labels = {}; TYPES.forEach(t => labels[t] = Object.create(null));
  const cities = Object.create(null);     // chave do município → {nome, rpm, rpmFrac, fracs}
  const codeToFrac = Object.create(null); // código da fração → {cia, pelotao, grupamento, rpm, sede}
  const loose = Object.create(null);      // tuplas sem município

  const addCity = (name, rpm, f) => {
    name = cityName_(name);
    if (!name) return;
    const k = key_(name);
    const c = cities[k] || (cities[k] = { nome: name, rpm: '', rpmFrac: '', fracs: {} });
    if (rpm && !c.rpm) c.rpm = rpm;
    if (f && FRAC.some(t => f[t])) {
      const fk = FRAC.map(t => f[t] || '').join('|');
      const prev = c.fracs[fk];
      c.fracs[fk] = { cia: f.cia || '', pelotao: f.pelotao || '', grupamento: f.grupamento || '', sede: (prev && prev.sede) || f.sede || '',
                      sedes: Object.assign({}, f.sedes || {}, (prev && prev.sedes) || {}) };
      if (f.rpm && !c.rpmFrac) c.rpmFrac = f.rpm;
    }
  };

  // 1) Dicionário explícito (opcional): Tipo | Código | Nome oficial
  const dict = findSheet_(ss, CFG.DICTIONARY_SHEETS);
  readDictionary_(ss).forEach(row => {
    const type = typeKey_(row[0]);
    const code = String(row[1] || '').trim();
    const name = strictName_(row[2], type);
    if (type && code && name) { labels[type][code] = name; codeVariants_(code).forEach(k => labels[type][k] = name); }
  });

  // 2) ARTICULACAO
  const art = findSheet_(ss, CFG.ARTICULACAO_SHEETS);
  if (art) {
    sheetsInfo.push(parseArticulacao_(art, codeToFrac, addCity));
  } else {
    warnings.push('Aba "ARTICULACAO" não encontrada: a área de responsabilidade das frações será deduzida das demais abas.');
  }

  // 3) Demais abas com hierarquia/município
  // O PLANO_RODOVIARIO descreve trechos de rodovia; não define a hierarquia das frações.
  const skip = [dict, art, findSheet_(ss, CFG.ALERT_SHEETS), findSheet_(ss, CFG.PLANO_SHEETS)].filter(Boolean).map(s => s.getSheetId());
  const tables = [];
  ss.getSheets().forEach(sheet => {
    if (skip.indexOf(sheet.getSheetId()) >= 0 || /^_/.test(sheet.getName())) return;
    const t = readTable_(sheet, { fields: TYPES.concat(['fracao', 'sede']), fracCodes: codeToFrac });
    sheetsInfo.push(describeTable_(sheet, t));
    const useful = TYPES.some(type => hasSource_(t, type)) || t.codeColumns.fracao >= 0;
    if (useful) tables.push(t);
  });
  // 3a) Código ↔ nome na mesma linha (ex.: ANEXO_A: MUNICIPIO + COD - IBGE + COD MUN REDS).
  tables.forEach(t => TYPES.forEach(type => {
    const nc = t.columns[type], cols = t.codeLists[type] || [];
    if (nc < 0 || !cols.length) return;
    t.rows.forEach(r => {
      const name = strictName_(r[nc], type);
      if (name) cols.forEach(c => codeVariants_(r[c]).forEach(k => { if (!labels[type][k]) labels[type][k] = name; }));
    });
  }));
  // 3b) Município → frações e RPM.
  tables.forEach(t => {
    t.rows.forEach(r => {
      const v = rowOwn_(r, t, { labels: labels, codeToFrac: codeToFrac });
      if (v.cidade) addCity(v.cidade, v.rpm, v);
      else if (HIER.some(x => v[x])) {
        const tu = [v.rpm, v.cia, v.pelotao, v.grupamento, '', v.sede || ''];
        loose[tu.join('|')] = tu;
      }
    });
  });

  // Remove frações "incompletas" quando o mesmo município tem a versão detalhada.
  Object.keys(cities).forEach(k => {
    const fr = cities[k].fracs, keys = Object.keys(fr);
    keys.forEach(a => {
      const fa = fr[a];
      const covered = keys.some(b => b !== a && fr[b] && FRAC.every(t => !fa[t] || fa[t] === fr[b][t]));
      if (covered) delete fr[a];
    });
  });

  // Tuplas para a cascata no navegador.
  const tuples = [];
  Object.keys(cities).forEach(k => {
    const c = cities[k], rpm = c.rpm || c.rpmFrac || '';
    const fr = Object.keys(c.fracs).map(x => c.fracs[x]);
    if (!fr.length) tuples.push([rpm, '', '', '', c.nome, '']);
    fr.forEach(f => tuples.push([rpm, f.cia, f.pelotao, f.grupamento, c.nome, f.sede || '']));
  });
  Object.keys(loose).forEach(k => tuples.push(loose[k]));

  const options = {};
  TYPES.forEach((type, i) => {
    const set = Object.create(null);
    tuples.forEach(t => { if (t[i]) set[key_(t[i])] = t[i]; });
    options[type] = Object.keys(set).map(k => set[k]).sort(sortPt_);
  });
  const nice = { rpm: 'RPM', cia: 'Companhia', pelotao: 'Pelotão', grupamento: 'Grupamento', cidade: 'Município' };
  TYPES.forEach(type => {
    if (options[type].length || type === 'rpm') return;
    if (type === 'rpm') warnings.push('RPM: nenhuma aba traz a RPM de cada município (ex.: "1ª RPM"). ' +
      'Inclua uma coluna "RPM" na aba de municípios (ANEXO_A, uma linha por município) para habilitar o filtro.');
    else warnings.push(nice[type] + ': nenhum valor válido encontrado.');
  });

  cacheSet_('ctx', { labels: labels, cities: cities, codeToFrac: codeToFrac });
  const semCidade = Object.keys(cities).length;
  return { labels: labels, cities: cities, codeToFrac: codeToFrac, tuples: tuples, options: options, municipios: semCidade,
           warnings: warnings, sheetsInfo: sheetsInfo };
}

/**
 * ARTICULACAO: aceita uma ou várias tabelas lado a lado (separadas por coluna vazia
 * ou pela repetição de um campo). Em cada linha procura: código da fração,
 * RPM/Cia/Pel/Gp (colunas próprias ou texto da coluna "Fração"), município e sede.
 * Linhas só com município + código herdam a fração pelo código (cruzamento).
 */
function parseArticulacao_(sheet, codeToFrac, addCity) {
  const vals = sheet.getDataRange().getDisplayValues();
  if (vals.length < 2) return '"' + sheet.getName() + '" vazia';
  let hr = 0, bestHits = 0;
  for (let i = 0; i < Math.min(CFG.HEADER_SCAN_ROWS, vals.length); i++) {
    const hits = vals[i].filter(h => articRole_(h)).length;
    if (hits > bestHits) { bestHits = hits; hr = i; }
  }
  const blocks = [];
  let cur = null;
  vals[hr].forEach((h, c) => {
    if (!String(h).trim()) { cur = null; return; }
    const role = articRole_(h);
    if (!role) return;
    if (role === 'cidade' && cur && cur.cidade) { cur.cidade.push(c); return; } // vários municípios por linha
    if (!cur || cur[role] !== undefined) { cur = {}; blocks.push(cur); }
    cur[role] = role === 'cidade' ? [c] : c;
  });

  const recs = [];
  const lastFrac = blocks.map(() => null);
  for (let i = hr + 1; i < vals.length; i++) {
    const row = vals[i];
    blocks.forEach((b, bi) => {
      const tuple = {};
      HIER.forEach(t => {
        let v = b[t] !== undefined ? strictName_(row[b[t]], t) : '';
        if (!v && b.fracao !== undefined) v = extractHier_(row[b.fracao], t);
        HIER.forEach(o => { if (!v && o !== t && b[o] !== undefined) v = extractHier_(row[b[o]], t); });
        tuple[t] = v;
      });
      const code = b.code !== undefined ? codeKey_(row[b.code]) : '';
      const upperSedes = [];
      const cityList = [];
      (b.cidade || []).forEach(c => String(row[c] || '').split(/\s*[;,\n]\s*|\s+e\s+/).forEach(x => {
        const n = cityName_(x); if (n) cityList.push(n);
      }));
      let sede = b.sede !== undefined ? cityName_(row[b.sede]) : '';
      ['grupamento', 'pelotao', 'cia'].forEach(lv => {
        if (!sede && b['sede_' + lv] !== undefined && tuple[lv]) sede = cityName_(row[b['sede_' + lv]]);
      });
      ['cia', 'pelotao', 'grupamento'].forEach(lv => {  // sedes de níveis superiores também são atendidas
        const c = b['sede_' + lv] !== undefined ? cityName_(row[b['sede_' + lv]]) : '';
        if (c && tuple[lv]) upperSedes.push([c, lv]);
      });
      if (!sede && b.fracao !== undefined) sede = sedeFromText_(row[b.fracao]);
      // Linha que define a fração (com código) e um só município: esse município é a sede.
      if (!sede && code && cityList.length === 1) sede = cityList[0];
      tuple.sedes = {};
      FRAC.forEach(lv => { if (b['sede_' + lv] !== undefined && tuple[lv]) { const c = cityName_(row[b['sede_' + lv]]); if (c) tuple.sedes[lv] = c; } });
      let has = FRAC.some(t => tuple[t]);
      if (has) { tuple.sede = sede; lastFrac[bi] = tuple; }
      else if (!code && cityList.length && lastFrac[bi]) {
        // Célula da fração mesclada/em branco: herda a fração da linha de cima.
        Object.assign(tuple, lastFrac[bi], { rpm: tuple.rpm || '' });
        has = true;
      }
      if (code && has) {
        const prev = codeToFrac[code] || {};
        HIER.concat(['sede']).forEach(t => { if (!prev[t] && tuple[t]) prev[t] = tuple[t]; });
        prev.sedes = Object.assign({}, tuple.sedes || {}, prev.sedes || {});
        codeToFrac[code] = prev;
      }
      if (!cityList.length) cityList.push('');
      cityList.forEach(city => {
        if (code || has || city || sede) recs.push({ code: code, tuple: tuple, has: has, city: city, sede: sede });
      });
      upperSedes.forEach(x => {
        const f = { cia: tuple.cia, pelotao: x[1] === 'cia' ? '' : tuple.pelotao, grupamento: '', sede: x[0] };
        recs.push({ code: '', tuple: f, has: true, city: x[0], sede: x[0] });
      });
    });
  }
  let served = 0;
  recs.forEach(rec => {
    let f = rec.has ? rec.tuple : (rec.code ? codeToFrac[rec.code] : null);
    if (f && rec.code && codeToFrac[rec.code]) {
      const full = codeToFrac[rec.code];
      f = Object.assign({}, f);
      FRAC.concat(['sede', 'rpm']).forEach(t => { if (!f[t] && full[t]) f[t] = full[t]; });
      f.sedes = Object.assign({}, full.sedes || {}, f.sedes || {});
    }
    if (rec.city) { addCity(rec.city, rec.tuple.rpm, f); if (f) served++; }
    const sede = rec.sede || (f && f.sede);
    if (sede && f) addCity(sede, rec.city ? '' : rec.tuple.rpm, f);
  });
  const roles = blocks.map(b => '[' + Object.keys(b).map(k => k + '=' + [].concat(b[k]).map(c => vals[hr][c]).join('+')).join(', ') + ']').join(' ');
  return '"' + sheet.getName() + '" (ARTICULACAO, cabeçalho linha ' + (hr + 1) + ') ' + roles +
    ' → ' + Object.keys(codeToFrac).length + ' frações com código, ' + served + ' vínculos município→fração';
}

function articRole_(h) {
  const n = key_(h).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n || n.length > 60) return '';
  const tokens = n.split(' ');
  const isCode = tokens.some(w => CODE_WORDS.indexOf(w) >= 0);
  const field = bestField_(n);
  if (isSedeHeader_(tokens)) return 'sede_' + sedeLevel_(tokens);
  if (tokens.indexOf('sede') >= 0) return 'sede';
  if (tokens.indexOf('ibge') >= 0 || (isCode && field === 'cidade')) return 'cidadeCode';
  if (tokens.indexOf('reds') >= 0) return '';
  if (isCode) return field === 'cidade' ? 'cidadeCode' : 'code';
  if (tokens.some(w => ['fracao', 'fracoes', 'unidade', 'ueop', 'subunidade', 'lotacao'].indexOf(w) >= 0)) return 'fracao';
  return ['cidade', 'rpm', 'cia', 'pelotao', 'grupamento', 'fracao'].indexOf(field) >= 0 ? field : '';
}

/** Valores próprios da linha (colunas, códigos de fração, texto combinado). */
function rowOwn_(r, table, ctx) {
  const v = {};
  TYPES.forEach(t => v[t] = cellName_(r, table, t, ctx.labels));
  v.sede = table.columns.sede >= 0 ? cityName_(r[table.columns.sede]) : '';
  const cc = table.codeColumns.fracao;
  if (cc >= 0 && ctx.codeToFrac) {
    const f = ctx.codeToFrac[codeKey_(r[cc])];
    if (f) { HIER.forEach(t => { if (!v[t] && f[t]) v[t] = f[t]; }); if (!v.sede) v.sede = f.sede || ''; }
  }
  return v;
}

/** Frações candidatas de um registro: as próprias, completadas pela área do município. */
function candidates_(v, city) {
  const cityFr = city ? Object.keys(city.fracs).map(k => city.fracs[k]) : [];
  if (!FRAC.some(t => v[t])) return cityFr;
  const own = { cia: v.cia, pelotao: v.pelotao, grupamento: v.grupamento, sede: v.sede || '' };
  const compat = cityFr.filter(f => FRAC.every(t => !own[t] || key_(own[t]) === key_(f[t])));
  return compat.length ? compat : [own];
}
function matchFrac_(f, sel) {
  if (sel.cia && key_(f.cia) !== sel.cia) return false;
  if (sel.pelotao && key_([f.cia, f.pelotao].filter(Boolean).join(JOIN)) !== sel.pelotao) return false;
  if (sel.grupamento && key_([f.cia, f.pelotao, f.grupamento].filter(Boolean).join(JOIN)) !== sel.grupamento) return false;
  return true;
}
function fracLabel_(f) { return [f.cia, f.pelotao, f.grupamento].filter(Boolean).join(' / '); }

function hasSource_(t, type) {
  return t.columns[type] >= 0 || t.codeColumns[type] >= 0 || (t.extract && t.extract[type] >= 0);
}
/** Nome válido: coluna de nome → código traduzido → extração de texto combinado. */
function cellName_(r, table, type, labels) {
  const nc = table.columns[type], cc = table.codeColumns[type], xc = table.extract ? table.extract[type] : -1;
  let v = nc >= 0 ? nameFrom_(r[nc], type, labels) : '';
  if (!v) {
    const cols = (table.codeLists && table.codeLists[type] && table.codeLists[type].length) ? table.codeLists[type] : (cc >= 0 ? [cc] : []);
    for (let i = 0; i < cols.length && !v; i++) { const l = lookupCode_(labels[type], r[cols[i]]); if (l) v = strictName_(l, type); }
  }
  if (!v && xc >= 0) v = extractHier_(r[xc], type);
  return v;
}
function codeVariants_(raw) {
  const k = codeKey_(raw);
  if (!k) return [];
  return /^\d{7}$/.test(k) ? [k, k.slice(0, 6)] : [k];
}
function lookupCode_(map, raw) {
  const ks = codeVariants_(raw);
  for (let i = 0; i < ks.length; i++) if (map[ks[i]]) return map[ks[i]];
  return '';
}
function nameFrom_(raw, type, labels) {
  const s = cellStr_(raw);
  if (!s) return '';
  const l = labels && labels[type] && labels[type][s];
  return strictName_(l || s, type);
}

/* ======================================================================= */
/*  Leitura de abas por cabeçalho (+ validação e detecção pelo conteúdo)   */
/* ======================================================================= */

function readTable_(sheet, opts) {
  opts = opts || {};
  const table = { name: sheet.getName(), headers: [], headerRow: 0, rows: [], rejected: {},
    columns: emptyColumns_(), codeColumns: emptyColumns_(), codeLists: {}, extract: emptyColumns_() };
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
  table.codeLists = best.map.codeLists;

  const firstData = best.row + 2;
  let nRows = lastRow - firstData + 1;
  if (opts.maxRows) nRows = Math.min(nRows, opts.maxRows);
  if (nRows < 1) return table;

  const sample = sheet.getRange(firstData, 1, Math.min(nRows, CFG.SAMPLE_ROWS), lastCol).getValues();
  const validRatio = (c, fn) => {
    let filled = 0, ok = 0;
    sample.forEach(r => { const s = cellStr_(r[c]); if (!s) return; filled++; if (fn(r[c])) ok++; });
    return filled ? ok / filled : 0;
  };

  // Colunas de RPM/Cia/Pel/Gp/Município com conteúdo inválido (ex.: "Sim/Não", "#######") são descartadas.
  TYPES.forEach(t => {
    const c = table.columns[t];
    if (c >= 0 && validRatio(c, v => strictName_(v, t)) < 0.3) { table.rejected[t] = table.headers[c]; table.columns[t] = -1; }
  });

  // RPM/Cia/Pel/Gp sem coluna válida: procura pelo conteúdo.
  const used = Object.keys(table.columns).map(k => table.columns[k]).filter(c => c >= 0);
  HIER.filter(t => table.columns[t] < 0 && table.codeColumns[t] < 0).forEach(type => {
    let bestCol = -1, bestScore = 0;
    for (let c = 0; c < lastCol; c++) {
      const ratio = validRatio(c, v => extractHier_(v, type));
      if (ratio < 0.3) continue;
      let score = ratio;
      if (c === table.columns.fracao) score += 0.3;
      if (used.indexOf(c) < 0) score += 0.1;
      if (score > bestScore) { bestScore = score; bestCol = c; }
    }
    table.extract[type] = bestCol;
  });

  // Código da fração sem cabeçalho claro: coluna cujos valores são códigos da ARTICULACAO.
  if (opts.fracCodes && Object.keys(opts.fracCodes).length && table.codeColumns.fracao < 0) {
    const set = opts.fracCodes;
    let bestCol = -1, bestR = 0;
    for (let c = 0; c < lastCol; c++) {
      if (used.indexOf(c) >= 0) continue;
      const ratio = validRatio(c, v => !!set[codeKey_(v)]);
      if (ratio >= 0.5 && ratio > bestR) { bestR = ratio; bestCol = c; }
    }
    table.codeColumns.fracao = bestCol;
  }

  const wanted = [];
  Object.keys(table.columns).forEach(k => {
    if (opts.fields && opts.fields.indexOf(k) < 0) return;
    [table.columns[k], table.codeColumns[k], table.extract[k]].concat(table.codeLists[k] || []).forEach(c => { if (c >= 0) wanted.push(c); });
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
  Object.keys(table.codeLists).forEach(k => { table.codeLists[k] = table.codeLists[k].filter(c => c >= minC && c <= maxC).map(c => c - minC); });
  return table;
}

function findStvTable_(ss, fracCodes) {
  const hasCoords = t => (t.columns.lat >= 0 && t.columns.lng >= 0) || t.columns.coord >= 0;
  const named = findSheet_(ss, CFG.STV_SHEETS);
  if (named) { const t = readTable_(named, { fracCodes: fracCodes }); if (hasCoords(t) && t.rows.length) return { sheet: named, table: t }; }
  let best = null;
  ss.getSheets().forEach(sh => {
    if (named && sh.getSheetId() === named.getSheetId()) return;
    const head = readTable_(sh, { maxRows: 1 });
    if (!hasCoords(head)) return;
    if (!best || sh.getLastRow() > best.getLastRow()) best = sh;
  });
  return best ? { sheet: best, table: readTable_(best, { fracCodes: fracCodes }) } : null;
}

function describeTable_(sheet, t) {
  const hdr = (t.allHeaders || t.headers).map(h => String(h).trim()).filter(String).slice(0, 40);
  const found = TYPES.filter(type => hasSource_(t, type))
    .map(type => type + (t.columns[type] < 0 && t.codeColumns[type] < 0 ? '(pelo conteúdo)' : ''));
  if (t.codeColumns.fracao >= 0) found.push('código da fração');
  const rej = Object.keys(t.rejected || {}).map(k => k + ' ignorada ("' + t.rejected[k] + '": valores inválidos)');
  return '"' + sheet.getName() + '" [linha ' + t.headerRow + ': ' + (hdr.join(', ') || 'vazia') + '] → ' +
    (found.length ? 'reconhecido: ' + found.join(', ') : 'nada reconhecido') + (rej.length ? '; ' + rej.join('; ') : '');
}

function bestField_(h) {
  const tokens = h.split(' ');
  let bestField = null, bestScore = 0;
  Object.keys(FIELD_ALIASES).forEach(f => {
    FIELD_ALIASES[f].forEach(alias => {
      let s = 0;
      if (h === alias) s = 3;
      else if (containsWords_(tokens, alias.split(' '))) s = alias.length > 3 ? 2 : 1;
      if (s > bestScore) { bestScore = s; bestField = f; }
    });
  });
  return bestField;
}

/** Associa cada campo à melhor coluna do cabeçalho, separando colunas de nome e de código. */
function mapHeaders_(headerRow) {
  const columns = emptyColumns_(), codeColumns = emptyColumns_(), codeLists = {};
  const score = {}, codeScore = {};
  headerRow.forEach((raw, idx) => {
    const h = key_(raw).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!h || h.length > 60) return;
    const tokens = h.split(' ');
    const isCode = tokens.some(w => CODE_WORDS.indexOf(w) >= 0);
    const isName = tokens.some(w => NAME_WORDS.indexOf(w) >= 0);
    let field = bestField_(h);
    if (!field) return;
    if (tokens.indexOf('sede') >= 0 || isSedeHeader_(tokens)) field = 'sede';
    const codeable = TYPES.indexOf(field) >= 0 || field === 'fracao';
    const target = isCode && !isName && codeable ? codeColumns : columns;
    if (target === codeColumns) (codeLists[field] = codeLists[field] || []).push(idx);
    const board = target === columns ? score : codeScore;
    const s = (FIELD_ALIASES[field].indexOf(h) >= 0 ? 4 : 2) + (isName ? 1 : 0);
    if (board[field] === undefined || s > board[field]) { board[field] = s; target[field] = idx; }
    // "Data/Hora" serve para os dois campos.
    if (tokens.indexOf('data') >= 0 && tokens.indexOf('hora') >= 0) {
      ['data', 'hora'].forEach(f => { if (columns[f] < 0) columns[f] = idx; });
    }
  });
  if (columns.hora < 0 && columns.data >= 0) columns.hora = columns.data; // data com horário
  return { columns: columns, codeColumns: codeColumns, codeLists: codeLists };
}

/** "CIA - MUNICÍPIO", "Pelotão - Município": município-sede da fração, não nome de fração. */
function isSedeHeader_(tokens) {
  const city = tokens.some(w => ['municipio', 'cidade', 'sede'].indexOf(w) >= 0);
  const hier = tokens.some(w => ['cia', 'companhia', 'pelotao', 'pel', 'grupamento', 'gp'].indexOf(w) >= 0);
  return city && hier;
}
function sedeLevel_(tokens) {
  if (tokens.some(w => w === 'grupamento' || w === 'gp')) return 'grupamento';
  if (tokens.some(w => w === 'pelotao' || w === 'pel')) return 'pelotao';
  return 'cia';
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
  const nk = s => key_(s).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const wanted = names.map(nk);
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (wanted.indexOf(nk(all[i].getName())) >= 0) return all[i];
  return null;
}
function readDictionary_(ss) {
  const sheet = findSheet_(ss, CFG.DICTIONARY_SHEETS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
}

/* ======================================================================= */
/*  Nomes amigáveis e validação                                            */
/* ======================================================================= */

/** Texto da célula; números formatados como data voltam a ser número; booleanos viram vazio. */
function cellStr_(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return '';
  if (v instanceof Date) {
    if (v.getFullYear() <= 1900) return String(Math.round((v.getTime() - Date.UTC(1899, 11, 30)) / 864e5));
    return '';
  }
  return String(v).trim().replace(/\s+/g, ' ');
}
function isJunk_(s) {
  return !s || /^#/.test(s) || /^(sim|nao|não|s|n|x|ok|true|false|verdadeiro|falso|yes|no|-+|—|n\/?a|nd|null|undefined|0)$/i.test(s);
}
/** Código interno/ID (ex.: 2020-017737686-001, 310010) — nunca exibido na interface. */
function isOpaque_(s) {
  s = String(s || '').trim();
  return /^\d{4,}$/.test(s) || /^\d[\d.\-\/]{5,}$/.test(s) || /^[A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+){2,}$/.test(s);
}
/**
 * Nome oficial validado. RPM e Cia só aceitam numeração ("01ª RPM", "03ª Cia PMRv");
 * Pelotão/Grupamento aceitam numeração ou nome próprio; Município aceita nome.
 */
function strictName_(raw, type) {
  const s = cellStr_(raw);
  if (isJunk_(s)) return '';
  if (type === 'cidade') return cityName_(s);
  const x = extractHier_(s, type);
  if (x) return x;
  if (/^\d{1,2}$/.test(s) && Number(s) > 0) return ordinal_(Number(s), type);
  if (type === 'rpm' || type === 'cia') return '';
  if (isOpaque_(s) || hierCount_(s) > 0 || /^\d/.test(s)) return '';
  if (!/[A-Za-zÀ-ú]{3,}/.test(s)) return '';
  const m = s.match(type === 'pelotao' ? /^(?:Pel(?:ot[aã]o)?\.?)\s+(.+)$/i : /^(?:Gp|Grupamento)\s+(.+)$/i);
  const base = (m ? m[1] : s).replace(/^(?:PM\s*RV|PRV|RV)\s+/i, '').trim();
  if (!base) return '';
  return (type === 'pelotao' ? 'Pelotão ' : 'Grupamento ') + (base === base.toUpperCase() ? titleCase_(base) : base);
}
function extractHier_(value, type) {
  const s = cellStr_(value);
  const list = HIER_RX[type] || [];
  for (let i = 0; i < list.length; i++) {
    const m = s.match(list[i]);
    if (m && Number(m[1]) > 0) return ordinal_(Number(m[1]), type);
  }
  return '';
}
function hierCount_(s) { return HIER.filter(t => extractHier_(s, t)).length; }
function ordinal_(n, type) {
  const female = type === 'rpm' || type === 'cia';
  const name = type === 'rpm' ? 'RPM' : type === 'cia' ? 'Cia PMRv' : type === 'pelotao' ? 'Pelotão' : 'Grupamento';
  return (n < 10 ? '0' : '') + n + (female ? 'ª' : 'º') + ' ' + name;
}
/** Município: sem "/MG", sem código, com maiúsculas corretas. */
function cityName_(raw) {
  const s = cellStr_(raw).replace(/\s*[-/(]\s*MG\s*\)?$/i, '').trim();
  if (isJunk_(s) || isOpaque_(s) || /^\d/.test(s) || hierCount_(s) > 0) return '';
  if (!/[A-Za-zÀ-ú]{2,}/.test(s)) return '';
  return s === s.toUpperCase() || s === s.toLowerCase() ? titleCase_(s) : s;
}
/** "2º Pel PMRv - Sete Lagoas" → "Sete Lagoas". */
function sedeFromText_(raw) {
  const parts = cellStr_(raw).split(/\s+[-–—]\s+/);
  if (parts.length < 2) return '';
  return cityName_(parts[parts.length - 1]);
}
function codeKey_(v) {
  const s = cellStr_(v).toUpperCase();
  if (isJunk_(s)) return '';
  return s.replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
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
function titleCase_(s) {
  const small = ['de', 'da', 'do', 'das', 'dos', 'e'];
  return s.toLowerCase().split(' ').map((w, i) =>
    i > 0 && small.indexOf(w) >= 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
/*  Números, coordenadas, datas, horas, mapas                              */
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
/** Janela horária com fim exclusivo; atravessa a meia-noite (ex.: 19h → 01h). */
function inWindow_(h, from, to) {
  if (from === to) return h === from;
  return from < to ? h >= from && h < to : h >= from || h < to;
}
function getHour_(value, tz) {
  if (value instanceof Date) {
    if (value.getFullYear() > 1900 && value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0) return null; // só data
    return Number(Utilities.formatDate(value, tz, 'H'));
  }
  if (typeof value === 'number') {
    if (value >= 0 && value < 1) return Math.floor(value * 24);           // fração do dia
    if (Number.isInteger(value) && value >= 0 && value <= 2359 && value % 100 < 60) return value > 23 ? Math.floor(value / 100) : value;
    return null;
  }
  const s = String(value || '').trim();
  const m = s.match(/(\d{1,2})[:h]\d{2}/i) || s.match(/^(\d{1,2})h?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}
/** Data em milissegundos (Date, "dd/mm/aaaa", "aaaa-mm-dd"). */
function parseDate_(v) {
  if (v instanceof Date) return v.getFullYear() > 1900 ? v.getTime() : null;
  if (typeof v === 'number' && v > 20000 && v < 80000) return Date.UTC(1899, 11, 30) + v * 864e5; // serial
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime(); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return null;
}
function geocode_(name) {
  const k = 'geo_' + digest_(key_(name));
  const hit = cacheGet_(k);
  if (hit) return hit;
  try {
    const res = Maps.newGeocoder().setRegion('br').setLanguage('pt-BR').geocode(name + ', ' + CFG.UF + ', Brasil');
    if (res.status !== 'OK' || !res.results.length) return { nome: name };
    const loc = res.results[0].geometry.location;
    const out = { nome: name, lat: loc.lat, lng: loc.lng };
    cacheSet_(k, out, 21600);
    return out;
  } catch (e) { return { nome: name }; }
}
function wazeType_(type, sub) {
  const t = { ACCIDENT: 'Acidente', JAM: 'Congestionamento', WEATHERHAZARD: 'Perigo', HAZARD: 'Perigo',
    ROAD_CLOSED: 'Via interditada', POLICE: 'Polícia', MISC: 'Alerta' }[type] || 'Alerta';
  return sub ? t + ' (' + String(sub).toLowerCase().replace(/_/g, ' ') + ')' : t;
}
function pairs_(flat) { const o = []; for (let i = 0; i + 1 < flat.length; i += 2) o.push([round_(flat[i], 5), round_(flat[i + 1], 5)]); return o; }
function stripHtml_(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function digest_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s)).replace(/=+$/, '');
}
function round_(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

/* ======================================================================= */
/*  Cache (divide em blocos para respeitar o limite de 100 KB por chave)   */
/* ======================================================================= */

function cacheSet_(name, obj, seconds) {
  try {
    const c = CacheService.getScriptCache();
    const json = JSON.stringify(obj), size = 90000, parts = Math.ceil(json.length / size);
    if (parts > 20) return;
    const data = {};
    for (let i = 0; i < parts; i++) data[CFG.CACHE_PREFIX + name + '_' + i] = json.substr(i * size, size);
    data[CFG.CACHE_PREFIX + name] = String(parts);
    c.putAll(data, seconds || CFG.CACHE_SECONDS);
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
