# Painel de Impostos — RAD

Painel que lê os **RADs (Relatório Sintético da Despesa) de cada unidade** e as **notas fiscais em PDF** e mostra:

- **Diferenças de imposto por categoria** (ICMS, IRRF Peça, IRRF Serviço, ISSQN): valor informado × recalculado, alíquotas, base, Simples × não Simples.
- **Dashboard visual** com indicadores, gráficos e a matriz alíquota × unidade.
- **Filtros**: imposto, situação, alíquota, unidade, município, optante Simples, responsável ISSQN e busca livre.
- **Notas fiscais por imposto** (segue o imposto selecionado no topo): ICMS e IRRF Peça → NFs de peça; ISSQN retido pelo
  tomador e IRRF Serviço → NFs de serviço; "Todos" → todas, sem repetir a mesma nota. O .zip e a relação CSV seguem a seleção.
  Antes era só **Notas fiscais com ISSQN retido pelo tomador**: para cada nota de serviço do RAD com responsável TOMADOR,
  localiza o PDF correspondente e confere no texto do PDF o CNPJ do prestador, o número da nota, a OS,
  o valor do ISSQN e a expressão "Retido pelo Tomador". Botão **Baixar notas encontradas (.zip)** (inclui `relacao_notas.csv`).
- **Card de responsáveis pelo ISSQN** (acima da tabela de notas fiscais): quantidade de CNPJs distintos com responsável
  **Tomador** (ISSQN retido e recolhido à prefeitura) e **Prestador**, com NFs, municípios e ISSQN de cada grupo; segue os filtros.
- **Tabela final** com todas as ordens (ordenável, exporta CSV). Ela e a tabela de notas fiscais vêm classificadas por **município**.

## Tutorial e conferência da pasta

- Aba lateral **📘 Tutorial** (e botão **📘 Como usar** na tela do usuário): explica o painel para cada perfil.
- Quadro **📂 Arquivos lidos da pasta** (aba Impostos): cada RAD encontrado, se foi computado ou desconsiderado (duplicado/erro),
  de onde veio o período (cabeçalho, nome da subpasta "RAD MMAAAA-Q" ou data de aprovação) e quantas ordens trouxe; PDFs por subpasta.
- O quadro também traz a contagem **por subpasta** (RADs lidos, RADs em PDF, PDFs de notas, outros). Subpasta "RAD …" sem RAD lido
  gera aviso no topo. Atalhos do Drive são seguidos; RAD em Excel de verdade (.xlsx/.xls binário) é convertido no servidor e,
  se a conversão falhar, lido no navegador. RAD salvo em PDF não é lido (precisa do .xls exportado do sistema).
- RAD convertido em Planilha Google (upload com conversão) é lido mesmo com colunas deslocadas; percentuais guardados como
  fração (0,18) viram 18%.
- **Diagnóstico sem o painel**: no editor do Apps Script, escolha a função `diagnosticoPasta` › Executar e veja o
  Registro de execução — lista cada arquivo da pasta, o tipo e se é lido como RAD.
- `VERSAO_CODIGO` (Code.gs) e `VERSAO_PAINEL` (Index.html) devem ser iguais: se o Code.gs publicado for antigo, o painel avisa.

## Regras fiscais

As orientações fiscais do CPE (peça × serviço, Simples, tomador/prestador do ISSQN) estão em
[`REGRAS-FISCAIS.md`](REGRAS-FISCAIS.md). O painel confere cada ordem com elas (coluna **Regras fiscais** e filtros de
Situação **Fora das regras fiscais** / **Regras: verificar**), e o filtro **Responsável ISSQN** só considera notas de serviço.

## Opção 1 — Google Drive + Apps Script (recomendado)

1. **RADs e notas fiscais (PDF)** vêm de uma pasta fixa: `PASTA_FONTES` no `Code.gs`
   (https://drive.google.com/drive/folders/1rZfLyvlpOswe5IsnHm8mIXWbtCnpvbYl), lida com **todas as subpastas**. Todo RAD
   ou PDF novo colocado lá (ou inserido pelos botões do painel, que gravam nela) entra ao clicar em ↻ Atualizar dados.
   **RAD duplicado** (mesma Unidade, mesmo período e as mesmas ordens com os mesmos valores, com qualquer nome ou
   subpasta) é desconsiderado — o painel avisa qual arquivo foi deixado de fora. Ordens repetidas dentro do mesmo RAD
   (Unidade + período) também contam uma vez só.
   A planilha de pré-faturamento continua sendo achada na **pasta raiz** (`PASTA_RAIZ`); com `PASTA_FONTES` vazio,
   RADs e notas também voltam a ser procurados na raiz. Dentro da raiz o script localiza sozinho, pelos nomes: Dentro dela o script localiza sozinho, pelos nomes:
   a pasta de RADs (nome com "RAD"), a de notas ("NOTA", "NF" ou "FISCA") e a planilha de pré-faturamento
   (Planilha Google com "FATUR" no nome). Sem pasta específica, lê a raiz toda. Para trocar a raiz ou procurar de novo:
   botão **📁 Pastas do Drive**. Configuração antiga (referência):
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

## Acesso: gestão × usuário (login e senha)

O mesmo projeto atende dois públicos:

| Perfil | Como entra | O que vê |
|---|---|---|
| **Gestor** | Menu da planilha (📊 Painel de Impostos › Abrir painel), o dono do script abrindo o App da Web na conta Google, e-mails em `GESTORES_EMAILS`, ou login com perfil Gestor | Impostos RAD, Pré-faturamento (gestão, com edição) e **Acessos** |
| **Usuário (PM)** | App da Web com login e senha próprios | Só as notas da sua **Unidade e Cia**, sem alterar nada; escreve apenas na coluna **RESPOSTA** |

Fluxo:
1. O PM abre o link do App da Web › **Solicitar acesso** › informa Nome PM, Unidade, Cia, login e senha.
2. O gestor abre **👥 Acessos**, confere/ajusta Unidade e Cia e clica **Aprovar** (ou Recusar). Depois pode bloquear, reativar, gerar senha temporária ou tornar o usuário gestor.
3. O PM entra e vê **só as notas aguardando aprovação** da sua Unidade **e** Cia (sem as colunas de RAD, nº do RAD e PA).
   Regras em `USU_*` no Code.gs (colunas de Unidade/Cia/situação, situação visível e colunas ocultas). Se não houver coluna
   de Cia, a Cia precisa estar escrita junto da Unidade (ex.: "1ª CIA BPMRV"); senão a linha não aparece. Antes era: situação (Aprovada / Pendente / Em análise, a partir da coluna VERIFICAÇÃO), a OBS do gestor e o campo **Resposta**.
4. A coluna **RESPOSTA** é criada automaticamente na planilha de pré-faturamento; cada resposta recebe uma nota na célula com quem respondeu e quando. Na gestão ela aparece só para leitura (💬).

Administrador inicial: login **frotaCPE** (perfil Gestor, Unidade/Cia CPE), criado automaticamente na aba `_usuarios` na primeira
utilização — o código guarda só o hash da senha. Troque a senha no primeiro acesso em **🔑 Trocar senha** (menu lateral).

Publicação do App da Web: **Implantar › Nova implantação › App da Web** — *Executar como: Eu* e *Quem pode acessar: Qualquer pessoa*.
Envie o link gerado aos PMs. Abra o painel uma vez pelo menu da planilha antes (isso registra a planilha usada pelo App da Web).

Segurança: senhas guardadas só como hash com sal na aba oculta `_usuarios`; sessão de 6 h; 5 tentativas erradas bloqueiam o login por 10 min;
o servidor confere Unidade/Cia em toda leitura e gravação. A coluna CIA é reconhecida pelo cabeçalho "CIA"/"Companhia"; sem ela, o filtro é só por Unidade.

## Períodos (quinzenas) e inclusão de RADs

- O painel lê o período escrito em cada RAD ("Período: 16/09/2026 à 30/09/2026") e oferece o filtro **Período do RAD**,
  agrupado por mês — sempre 1ª quinzena, 2ª quinzena e mês inteiro (mesmo que uma quinzena ainda não tenha RAD), com a quantidade de ordens de cada um. Se o RAD
  não tiver o período no cabeçalho, a quinzena vem da data de aprovação da ordem. A tabela final tem a coluna "Período (RAD)".
- **⬆ Inserir RADs** (gestão, App da Web): escolha os .xls baixados do sistema; cada um é guardado na pasta de RADs, na
  subpasta do período (ex.: "2026-09 · 2ª quinzena"), com o nome "RAD <Unidade> <AAAA-MM> <1ª|2ª> quinzena.xls".
  Reenviar o RAD da mesma Unidade e período substitui o anterior (o antigo vai para a lixeira).
- **⬆ Inserir notas (PDF)** (gestão, App da Web): escolha um ou vários PDFs; são guardados na pasta de notas, na subpasta da
  quinzena escolhida no filtro "Período do RAD" (ou da quinzena atual, se não houver filtro). PDF repetido (mesmo nome e tamanho)
  não é duplicado. Logo após o envio o painel procura as notas nesses PDFs, sem recarregar tudo. Limite: 20 MB por PDF.

## SOFI — pagamento dos RADs

Perfil **SOFI** (definido pelo gestor em Acessos): a aba SOFI mostra o pagamento dos RADs e, logo abaixo, o painel de Impostos RAD completo (sem os botões de inserir/pastas). Na aba
**🏦 SOFI**, com a tabela dos RADs (Unidade × quinzena) ainda não pagos — Nº de OS, valor aprovado, impostos retidos, taxa
adm. e valor líquido — e o botão **A pagar** (ao clicar vira **✓ Pago**; o RAD sai da lista na próxima atualização). **📋 Consultar RADs** mostra todos, pagos e a pagar, com
data e responsável do pagamento, opção de desfazer e exportação CSV. O registro fica na aba oculta `_rads_pagos`.
O gestor também vê a aba SOFI.

## Almoxarifado — pagamento dos RADs

Perfil **Almoxarifado** (`ALMOX`): o usuário pede acesso na tela de login (aba "Solicitar acesso") e o gestor, em **Acessos**,
escolhe o perfil **Almoxarifado** e aprova. Ao entrar com login e senha, ele vê **só a aba 📦 Almoxarifado**: a mesma tela da
SOFI (RADs a pagar, Consultar RADs, CSV e o painel de Impostos sem os botões de inserir/pastas). O controle de pagamento é
**próprio do Almoxarifado**, na aba oculta `_rads_pagos_almox`: marcar um RAD como pago no Almoxarifado não altera a SOFI, e vice-versa.
Cada setor só lê e grava o próprio controle; o gestor vê as duas abas.

## Visual

Identidade "Gestão à Vista CPE": menu lateral preto com o escudo padrão PMMG/CPE (imagem `escudo-pmmg-cpe.webp`, embutida
no Index.html) e "Painel de Gestão", barra superior preta com título e faixa dourada de status, fundo bege e indicadores
com barra lateral.
