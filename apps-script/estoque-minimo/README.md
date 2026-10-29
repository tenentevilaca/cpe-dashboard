# Estoque mínimo e lógica de compra (Google Planilhas + Apps Script)

Template para diagnosticar a criticidade dos materiais e calcular estoque mínimo, estoque
máximo, reserva técnica e a **data limite para iniciar o processo de compra**, considerando
que no setor público a reposição depende de licitação e por isso o estoque zero não se aplica.

## Método

É um modelo híbrido de técnicas consolidadas, ajustado ao documento *A lógica da distribuição na PMMG*:

| Etapa | Técnica | Para que serve aqui |
|---|---|---|
| Classificação | **VED** (Vital/Essencial/Desejável) + **XYZ** (variabilidade), ponderados por pesos (multicritério, tipo AHP simplificado) | Diz *o quanto* proteger cada família |
| Demanda | **Planejamento por direcionador** (consumo por policial, por viatura ou por unidade × efetivo), comparado ao histórico | Estima a demanda mesmo sem histórico e acusa pedido inflado |
| Prazo | **Lead time real medido por fase** (demanda → processo → homologação → empenho → entrega → ponta) | Define por quanto tempo o estoque precisa durar |
| Estoque | **Ponto de pedido com estoque de segurança** (estatístico quando há desvio; senão fator de pulmão) e teto máximo | Gatilho de compra e limite contra acúmulo |
| Permanentes | **Reserva técnica** por taxa de indisponibilidade | Bens duráveis não se gerem por consumo médio (doc. item 11) |
| Compra | Prazo reduzido quando há **Ata de Registro de Preços** vigente | Reduz o estoque necessário sem aumentar o risco |

### Variáveis, critérios e parâmetros

- **Variáveis** (números medidos, entram nas fórmulas): efetivo, viaturas, taxa de consumo por
  policial/viatura/unidade, consumo histórico e desvio, saldo, em trânsito, datas de cada fase do
  processo de compra, prazo da ata, dias de distribuição, parque instalado, taxa de indisponibilidade.
- **Critérios** (nota 1-5 por família, ponderada pelos pesos da aba `PARAMETROS`):
  `ESS` essencialidade para o policiamento, `SEG` risco à segurança na falta, `SUB` dificuldade de
  substituição, `CTL` controle institucional, `VAR` variabilidade, `TR` duração da reposição,
  `TRV` incerteza da reposição. `TR`, `TRV` e `VAR` são **calculados automaticamente** a partir das
  variáveis quando há dados (prazo medido, desvio dos processos, desvio do consumo).
- **Parâmetros** (política do P4): pesos, limites de classe, nível de serviço (z), margens e horizonte de compra.

### Fórmulas

```
Demanda mensal (d)   = efetivo (ou viaturas, ou unidades) × taxa por mês   |  histórico
Tempo de reposição   = prazo da ata (se vigente) | prazo do item | média dos processos | padrão da família
                       + dias de distribuição até a ponta
Estoque de segurança = z × √(LT·σd² + d²·σLT²)          (com desvio do consumo)
                     = d × margem da classe × (1 + reforço se VAR ≥ 4) + d × σLT   (sem desvio)
Estoque mínimo       = d × LT + estoque de segurança    → é o gatilho para iniciar a compra
Estoque máximo       = mínimo + d × horizonte de cobertura da compra
Data limite          = hoje + (saldo + em trânsito − mínimo) / d
Reserva técnica      = parque × taxa de indisponibilidade anual × LT/365 × fator da classe
```

Classe: nota ≥ `lim_operacional` → Operacional; ≥ `lim_funcional` → Funcional; senão Administrativo.
Com `piso_essencial = S`, um item com essencialidade 5 é sempre Operacional.

Cada resultado traz uma **justificativa** em texto (fonte da demanda, origem do prazo, método da
segurança, classe), que é o rastro decisório pedido pelo documento.

## Abas

| Aba | Quem preenche | Conteúdo |
|---|---|---|
| `PARAMETROS` | P4 | Pesos, limites, nível de serviço, margens |
| `FAMILIAS` | Especialista | 99 famílias de criticidade já cadastradas, com notas sugeridas |
| `UNIDADES` | CPELOG + P4 | Uma linha por UEOp; viaturas e frações vêm do CPELOG, **o efetivo é digitado** |
| `ITENS` | CPELOG + almoxarifado | Os materiais do CPELOG já classificados em famílias; taxas, ata e prazos são digitados |
| `PROCESSOS` | Seção de compras | Datas de cada processo; o script calcula a duração das fases |
| `RESULTADOS` | Script | Saída do cálculo (não editar) |

### Valores padrão do sistema (texto cinza)

Na aba `ITENS`, as colunas de base de consumo, taxa de indisponibilidade e as cinco fases do
processo de compra (fase interna, licitação, contratação, entrega e distribuição) vêm preenchidas
com o **padrão do sistema em cinza**. Ao digitar um valor real, ele fica preto e passa a valer.
Apagar a célula devolve o padrão cinza no próximo recálculo. A justificativa de cada item diz se o
prazo usado foi `padrão do sistema`, `fases informadas no item`, `histórico de N processo(s)` ou
`ata de registro de preços`.

O padrão das fases divide o tempo de compra da família em 20% fase interna, 45% licitação,
10% contratação e 25% entrega, mais 10 dias de distribuição (`DIVISAO_FASES` em `Configuracao.gs`).

### Importação do CPELOG

`Importar do CPELOG` lê (somente leitura) o estoque do Consumo PRO e os bens do BIMG, enquadra
cada material novo numa família e **mescla**: atualiza descrição, saldo e parque, e preserva tudo
o que foi digitado (família corrigida, taxas, ata, fases). Itens que deixarem de existir no CPELOG
ficam no fim da aba com a marca `Não encontrado no CPELOG`. Leva cerca de 30 segundos.

O login e a senha ficam nas **Propriedades do script** (menu `Configurar acesso ao CPELOG`),
nunca no código ou na planilha. Quem tiver permissão de edição no projeto Apps Script pode
vê-los, então mantenha o projeto restrito.

### Cuidados na taxa por base

A base `VIATURA` multiplica pela frota inteira. Para itens que só servem a parte da frota
(pneu de uma medida, filtro de um modelo), use `HISTORICO` ou ajuste a taxa para a frota toda.

## Instalação

1. Crie uma planilha nova no Google Drive (conta institucional, se houver).
2. Menu **Extensões → Apps Script**. Apague o conteúdo do `Código.gs` padrão.
3. Crie os arquivos de script `Calculo`, `Classificacao`, `Configuracao`, `Importacao`, `Codigo`
   e o arquivo HTML `Painel`, e cole o conteúdo dos arquivos desta pasta.
4. Em **Configurações do projeto**, marque *Mostrar arquivo de manifesto "appsscript.json"* e
   substitua o conteúdo pelo desta pasta.
5. Salve, volte à planilha e recarregue. Aparece o menu **Estoque mínimo**:
   1. *Configurar planilha* (autorize na primeira vez);
   2. *Configurar acesso ao CPELOG* (número de polícia e senha);
   3. *Importar do CPELOG*;
   4. preencha o efetivo em `UNIDADES` e as taxas dos itens principais em `ITENS`;
   5. *Recalcular*.
6. Painel web: **Implantar → Nova implantação → App da Web**. O manifesto vem com acesso `MYSELF`
   (só você). Libere para a organização apenas em conta institucional: os dados incluem material controlado.

Alternativa com [clasp](https://github.com/google/clasp): `clasp create --type sheets` nesta pasta e `clasp push`.

## Testes

O motor de cálculo não depende do Google e pode ser testado localmente:

```bash
node apps-script/estoque-minimo/teste/calculo.test.js
# ponta a ponta contra o CPELOG (somente leitura):
U=<numero> P=<senha> node apps-script/estoque-minimo/teste/importacao.e2e.js apps-script/estoque-minimo
```
