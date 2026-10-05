# Painel de Impostos — RAD

Painel que lê os **RADs (Relatório Sintético da Despesa) de cada unidade** e as **notas fiscais em PDF** e mostra:

- **Diferenças de imposto por categoria** (ICMS, IRRF Peça, IRRF Serviço, ISSQN): valor informado × recalculado, alíquotas, base, Simples × não Simples.
- **Dashboard visual** com indicadores, gráficos e a matriz alíquota × unidade.
- **Filtros**: imposto, situação, alíquota, unidade, município, optante Simples, responsável ISSQN e busca livre.
- **Notas fiscais com ISSQN retido pelo tomador**: para cada nota de serviço do RAD com responsável TOMADOR,
  localiza o PDF correspondente e confere no texto do PDF o CNPJ do prestador, o número da nota, a OS,
  o valor do ISSQN e a expressão "Retido pelo Tomador". Botão **Baixar notas encontradas (.zip)** (inclui `relacao_notas.csv`).
- **Tabela final** com todas as ordens (ordenável, exporta CSV).

## Opção 1 — Google Drive + Apps Script (recomendado)

1. Coloque numa pasta do Google Drive os RADs exportados do sistema (`RelatorioSinteticoDaDespesaRAD*.xls`, um por unidade)
   e os PDFs das notas (podem estar em subpastas).
2. Crie uma Planilha Google (pode ser em branco) › **Extensões › Apps Script**.
3. Cole `Code.gs`; crie o arquivo HTML `Index` e cole `Index.html`.
4. Ative o serviço avançado do Drive: em **Serviços (+)** adicione **Drive API** (v3) — ou, em
   *Configurações do projeto › Mostrar "appsscript.json"*, cole o `appsscript.json` desta pasta.
5. Salve, recarregue a planilha e abra **📊 Painel de Impostos › Abrir painel** (autorize na 1ª vez).
6. No painel, clique em **📁 Pasta do Drive** e cole o link da pasta.

O texto dos PDFs é lido pelo OCR do Google Drive (funciona também com PDF escaneado) e guardado na aba oculta
`_cache_pdf`, então só a primeira leitura de cada PDF é demorada. Primeiro são lidos os PDFs com o número da nota
no nome do arquivo; o botão **🔎 Procurar em todos os PDFs** lê os demais.

Sem pasta configurada, o painel usa a aba `BADE SE DADOS` da planilha (formato consolidado antigo).

## Opção 2 — Sem Google (arquivos no computador)

Abra `painel-impostos.html` no Chrome/Edge, clique em **Escolher arquivos…** e selecione de uma vez os RADs (.xls)
e os PDFs das notas. Nada é enviado para a internet (só as bibliotecas de gráfico/PDF/ZIP são baixadas).
PDFs escaneados (imagem, sem texto) só são localizados pelo nome do arquivo nessa opção.

## Regras

| Item | Regra |
|---|---|
| Unidade | Campo "Nome Órgão / Entidade" do RAD (ex.: `25A BPMAMB` → `BPMAMB`) |
| RAD repetido | Ordens repetidas (mesma OS/NF/placa) são ignoradas e o painel avisa |
| Nota de tomador | NF Serviço com Responsável ISSQN = TOMADOR (ou vazio com ISSQN retido > 0) |
| Identificação da nota (ID) | Número da NF de serviço **+** número da OS, procurados no texto do PDF (a nota não traz a unidade) |
| "Conferir: só Nº ou só OS" | O PDF tem só um dos dois, mas tem o CNPJ do prestador — confira manualmente |
| Nota "encontrada pelo nome" | Nome do arquivo tem o número da NF e o nome do estabelecimento, mas o texto não pôde ser lido |
| Base peça | Valor a Pagar Peça + ICMS + IRRF peça |
| Base serviço | Valor Serviço + IRRF serviço + ISSQN retido pelo tomador |
| Líquido recalculado | Valor Aprovado − ICMS − IRRF peça − IRRF serviço − ISSQN retido |
