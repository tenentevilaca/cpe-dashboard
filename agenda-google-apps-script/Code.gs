/**
 * Agenda de Tarefas — CPE 2026
 * Armazena as tarefas numa aba da própria planilha e serve o painel web (farol de prazo).
 */

const SHEET_NAME = 'Agenda';
const HEADERS = ['ID', 'Tarefa', 'Responsavel', 'DataInicio', 'Prazo', 'Concluida', 'DataConclusao'];

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Agenda de Tarefas — CPE 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

/** Retorna todas as tarefas cadastradas. */
function listarTarefas() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  return rows
    .filter(r => r[0] !== '' && r[0] != null)
    .map(r => ({
      id: r[0],
      tarefa: r[1],
      responsavel: r[2],
      dataInicio: formatDate_(r[3]),
      prazo: formatDate_(r[4]),
      concluida: r[5] === true || r[5] === 'TRUE' || r[5] === 'VERDADEIRO',
      dataConclusao: formatDate_(r[6])
    }));
}

/** Adiciona uma nova tarefa. dados = {tarefa, responsavel, dataInicio, prazo} (datas em 'yyyy-MM-dd'). */
function adicionarTarefa(dados) {
  if (!dados || !dados.tarefa || !dados.responsavel || !dados.dataInicio || !dados.prazo) {
    throw new Error('Preencha tarefa, responsável, data de início e prazo.');
  }
  const inicio = new Date(dados.dataInicio + 'T00:00:00');
  const prazo = new Date(dados.prazo + 'T00:00:00');
  if (isNaN(inicio.getTime()) || isNaN(prazo.getTime())) {
    throw new Error('Datas inválidas.');
  }
  if (prazo < inicio) {
    throw new Error('O prazo não pode ser anterior à data de início.');
  }
  const sheet = getSheet_();
  const id = Utilities.getUuid();
  sheet.appendRow([id, dados.tarefa, dados.responsavel, inicio, prazo, false, '']);
  return listarTarefas();
}

/** Marca/desmarca uma tarefa como concluída. */
function concluirTarefa(id, concluida) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 6).setValue(!!concluida);
      sheet.getRange(i + 1, 7).setValue(concluida ? new Date() : '');
      break;
    }
  }
  return listarTarefas();
}

/** Remove uma tarefa. */
function excluirTarefa(id) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return listarTarefas();
}
