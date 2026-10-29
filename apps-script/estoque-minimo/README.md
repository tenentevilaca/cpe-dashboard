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
| `FAMILIAS` | Especialista | 97 famílias de criticidade já cadastradas, com notas sugeridas |
| `UNIDADES` | P4 | Efetivo e viaturas de cada fração |
| `ITENS` | Almoxarifado | Material, família, base de consumo, taxa, saldo, ata |
| `PROCESSOS` | Seção de compras | Datas de cada processo; o script calcula a duração das fases |
| `RESULTADOS` | Script | Saída do cálculo (não editar) |

As abas vêm com linhas `EXEMPLO` (fictícias). Apague-as ao carregar os dados reais.

## Instalação

1. Crie uma planilha nova no Google Drive.
2. Menu **Extensões → Apps Script**. Apague o conteúdo do `Código.gs` padrão.
3. Crie os arquivos `Calculo.gs`, `Configuracao.gs`, `Codigo.gs` (tipo *Script*) e `Painel.html`
   (tipo *HTML*) e cole o conteúdo de cada um desta pasta.
4. Em **Configurações do projeto**, marque *Mostrar arquivo de manifesto* e substitua o
   `appsscript.json` pelo desta pasta.
5. Salve, volte à planilha e recarregue a página. Aparece o menu **Estoque mínimo**.
6. **Estoque mínimo → 1. Configurar planilha** (autorize na primeira vez) e depois **2. Recalcular**.
7. Painel web: no Apps Script, **Implantar → Nova implantação → App da Web**. O manifesto vem com
   acesso `MYSELF` (só você). Para liberar ao P4, troque para *Qualquer pessoa da organização*
   apenas se a conta for institucional, porque os dados incluem material controlado.

Alternativa com [clasp](https://github.com/google/clasp): `clasp create --type sheets` nesta pasta e `clasp push`.

## Testes

O motor de cálculo não depende do Google e pode ser testado localmente:

```bash
node apps-script/estoque-minimo/teste/calculo.test.js
```
