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

1. As pastas já vêm configuradas no `Code.gs`:
   - RADs (`RelatorioSinteticoDaDespesaRAD*.xls`, um por unidade): `PASTA_RADS_PADRAO`
   - Notas fiscais em PDF (subpastas incluídas): `PASTA_NOTAS_PADRAO`

   Para trocar, use o botão **📁 Pastas do Drive** no painel. Na pasta de RADs são lidos: o .xls exportado do sistema, planilhas Excel (.xlsx/.xls, e Planilhas Google. Arquivos "UNIAO RAD" (junção dos demais) são desconsiderados — ajuste `IGNORAR_RADS` no Code.gs se precisar. Novos RADs colocados na pasta (ou em subpastas) entram automaticamente ao clicar em ↻ Atualizar dados.
2. Crie uma Planilha Google (pode ser em branco) › **Extensões › Apps Script**.
3. Cole `Code.gs`; crie o arquivo HTML `Index` e cole `Index.html`.
4. Ative o serviço avançado do Drive: em **Serviços (+)** adicione **Drive API** (v3) — ou, em
   *Configurações do projeto › Mostrar "appsscript.json"*, cole o `appsscript.json` desta pasta.
5. Salve, recarregue a planilha e abra **📊 Painel de Impostos › Abrir painel** (autorize na 1ª vez).

Localização das notas (automática, ao abrir o painel):
1. PDFs já lidos antes vêm do cache (aba oculta `_cache_pdf_v2`);
2. depois são lidos os PDFs com o nº da nota ou da OS no nome do arquivo;
3. se ainda faltar nota, os demais PDFs — a leitura para assim que todas forem localizadas.

Enquanto localiza, o botão de download mostra ⏳ e fica bloqueado; é liberado ao final.

**Economia de dados:** o RAD é convertido em tabela no servidor (≈ 4× menor que o .xls); dos PDFs o painel
recebe só os números procurados (dezenas de bytes por PDF, nunca o texto); o .zip é gravado na subpasta
`Notas tomador (painel)` e baixado direto do Drive (o .zip anterior vai para a lixeira); sem fontes externas.

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

## Pré-faturamento (botão na lateral esquerda)

O botão **🧾 Pré-faturamento** abre o painel da planilha definida em `PREFAT_PLANILHA_ID` / `PREFAT_ABA_GID` no `Code.gs`
(precisa ser uma Planilha Google — arquivo .xlsx não pode ser editado pelo script).

- A planilha só é carregada quando o painel é aberto (economia de dados).
- Botões de situação com a contagem por valor da coluna **VERIFICAÇÃO**; filtros por **UNIDADE**, **ÚLTIMA VERIFICAÇÃO** e **DATA DA VERIFICAÇÃO**; busca livre.
- Colunas editáveis (marcadas com ✎), gravadas direto na planilha:
  - **ÚLTIMA VERIFICAÇÃO**, **VERIFICAÇÃO**: lista suspensa (opções da validação de dados da coluna + valores já usados) e “＋ Novo valor…”, que também acrescenta a opção à validação da planilha;
  - **DATA DA VERIFICAÇÃO**: lista com as datas usadas + hoje, e “＋ Outra data…” (dd/mm/aaaa);
  - **OBS**: texto livre, gravado ao sair do campo.
- Se outra pessoa alterou a célula depois que o painel foi aberto, nada é sobrescrito e o painel avisa o valor atual.
- As colunas são reconhecidas pelo nome do cabeçalho (sem acento/maiúsculas): ajuste `PREFAT_COLUNAS` se os nomes mudarem.
