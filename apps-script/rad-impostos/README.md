# Painel de Impostos — RAD (Google Apps Script)

Painel que lê a aba **BADE SE DADOS** da planilha RAD e mostra:

- **Diferenças de imposto por categoria** (ICMS, IRRF Peça, IRRF Serviço, ISSQN): notas com/sem retenção,
  alíquotas encontradas, base de cálculo, valor informado × valor recalculado, diferença, alíquota efetiva
  e divisão Simples × não Simples.
- **Dashboard visual**: indicadores (ordens, notas fiscais, valor aprovado, impostos, líquido, diferença),
  total por imposto, impostos por unidade, notas por alíquota, top 10 estabelecimentos e matriz alíquota × unidade.
- **Filtros**: imposto, situação (com retenção / sem retenção / com diferença), alíquota, unidade,
  optante Simples, responsável ISSQN e busca livre.
- **Tabela final** com todas as notas (ordenável e exportável em CSV).

## Como instalar

1. Abra a planilha no Google Sheets (se for .xlsx, use *Arquivo › Salvar como Planilhas Google*).
2. *Extensões › Apps Script*.
3. Substitua o conteúdo de `Code.gs` pelo arquivo `Code.gs` desta pasta.
4. Clique em **+ › HTML**, nomeie como `Index` e cole o conteúdo de `Index.html`.
5. (Opcional) *Configurações do projeto › Mostrar arquivo de manifesto* e cole `appsscript.json`.
6. Salve, recarregue a planilha e use o menu **📊 Painel de Impostos › Abrir painel**
   (na primeira vez o Google pede autorização).

Para abrir em tela cheia no navegador: *Implantar › Nova implantação › App da Web* e use a URL gerada.

## Regras de cálculo

| Item | Fórmula |
|---|---|
| Base peça | Valor a Pagar Peça + ICMS + IRRF peça |
| Base serviço | Valor Serviço + IRRF serviço + ISSQN (só quando o responsável é o **TOMADOR**) |
| Imposto recalculado | Base × alíquota |
| Líquido recalculado | Valor Aprovado − ICMS − IRRF peça − IRRF serviço − ISSQN retido |

- "ICMS DESONERADO" na coluna `% ICMS` é tratado como desonerado; a alíquota efetiva é mostrada entre parênteses.
- Diferenças até R$ 0,05 (arredondamento) são ignoradas — ajuste `TOLERANCIA` no `Index.html`.
- Se a aba mudar de nome, ajuste `ABA_DADOS` no `Code.gs`. As colunas são localizadas pelo nome do cabeçalho
  (as colunas repetidas `% IRRF`/`IRRF` são lidas na ordem: 1ª = peça, 2ª = serviço).
