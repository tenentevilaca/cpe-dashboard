# Gestão à Vista — Subcorregedoria CPE (Google Apps Script)

Painel de gestão à vista para a planilha **ROTINA DIÁRIA SUBCORREGEDORIA CPE**, rodando
como um Web App do Google Apps Script vinculado (bound) à própria planilha — sem
precisar de servidor externo, e respeitando o compartilhamento/permissões do Google
Workspace já configurado na planilha.

Não foi possível publicar isso automaticamente na sua conta (esta sessão não tem
acesso à sua conta Google). Os arquivos abaixo já estão prontos — é só copiar e colar.

## O que o painel faz

- **Página inicial**: cards por categoria (Demandas, Ouvidoria/OGE, Disciplinar,
  Efetivo, Reconhecimento) com contagem de Finalizado / Em andamento / Atrasado por
  aba, mais gráficos consolidados. Clicar em um card abre a visão daquela aba.
- **Visão por aba** (17 das 18 abas seguem um template genérico configurável):
  filtro por unidade, por situação, busca livre, checkbox "somente pendentes",
  gráfico de situação e gráfico de top unidades, tabela paginada e um popup com
  todos os campos do registro ao clicar na linha.
- **ENCARREGADOS** tem uma página própria, porque a aba tem um layout diferente
  (3 sub-tabelas: escalas do Conselho de Justiça, indicados CPM e controle de
  processos entregues aos encarregados).
- **Situação calculada automaticamente**: Finalizado / Em andamento / Atrasado /
  Sem status, com uma regra única no servidor (função `classify_` em `Code.gs`).
  O texto original da coluna STATUS continua visível no popup do registro.

## Passo a passo para publicar

1. Abra a planilha no navegador → menu **Extensões → Apps Script**.
2. Um projeto em branco abre com um `Code.gs` vazio. Apague o conteúdo e cole o
   conteúdo do arquivo `Code.gs` deste repositório.
3. No menu lateral do editor, clique em **+** ao lado de "Arquivos" → **HTML** e
   crie, um de cada vez, os arquivos: `Index`, `Style`, `App`, `ChartLib`
   (o Apps Script já adiciona a extensão `.html` sozinho). Cole o conteúdo
   correspondente de cada arquivo deste repositório em cada um.
4. Clique no ícone de engrenagem **Configurações do projeto** → marque
   **"Mostrar arquivo de manifesto 'appsscript.json' no editor"**. Um arquivo
   `appsscript.json` vai aparecer na lista — abra-o e substitua o conteúdo pelo
   `appsscript.json` deste repositório.
5. Salve tudo (ícone de disquete ou Ctrl+S).
6. Clique em **Implantar → Nova implantação**.
   - Tipo: **App da Web**.
   - Executar como: **Eu (seu e-mail)**.
   - Quem pode acessar: escolha conforme sua necessidade — **"Qualquer pessoa da
     [sua organização]"** é o mais adequado para um painel interno da corregedoria.
   - Clique em **Implantar** e autorize as permissões pedidas (o script só lê a
     própria planilha).
7. Copie a URL do Web App gerada — é o link do painel. Pode favoritar/fixar.

### Atualizando depois de publicado

Sempre que editar `Code.gs` ou os `.html`, gere uma **nova implantação** (ou use
"Gerenciar implantações → editar → Nova versão") para que as mudanças valham na
URL já distribuída.

## Pontos de atenção

- **Nomes das abas têm que bater exatamente** com o que está em `CONFIG` no
  `Code.gs` (incluindo espaço e acentuação, ex.: `'REQUISIÇÕES '` com espaço no
  final, `'DESERÇÂO'` com acento circunflexo — é como está escrito na planilha
  hoje). Se alguma aba for renomeada, ajuste `sheetName` na respectiva entrada
  do `CONFIG`.
- **Classificação de situação é uma heurística**, pensada a partir do conteúdo
  atual da planilha:
  - se existe coluna de encerramento (ex.: "DATA ENCERRAMENTO") preenchida →
    Finalizado;
  - senão, se a coluna de status é um enum limpo (FINALIZADO/EM ANDAMENTO) →
    usa o valor direto;
  - senão, se o texto do status contém palavras como "FINALIZ", "RESPONDID",
    "ENCERR", "ARQUIV", "SOLTO", "EXCLU", "TRANSFER" etc. (lista `PALAVRAS_CONCLUIDO`
    no topo do `Code.gs`) → Finalizado;
  - senão, se tem prazo final vencido → Atrasado;
  - senão → Em andamento (ou "Sem status" nas abas sem workflow, como
    REQUISIÇÕES e SNGB, que são só listas informativas).
  Se perceber algum caso classificado errado, me diga qual aba/linha que eu ajusto
  a regra ou a lista de palavras.
- **ENCARREGADOS** é lida por uma função separada (`getEncarregadosView`) que
  interpreta os blocos de título/sub-tabela da aba. Se a estrutura dessa aba
  mudar bastante (novo bloco, nova escala), pode ser preciso ajustar essa função.
- O painel lê os dados **ao vivo** a cada carregamento/clique em "Atualizar
  dados" — não há cópia/cache separado, então ele sempre reflete o estado atual
  da planilha.
