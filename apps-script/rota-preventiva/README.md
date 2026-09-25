# Rota Preventiva (Google Apps Script)

App web da Rota Preventiva / Policiamento Preditivo do Estado-Maior do CPE / PMRv.

## Instalação
1. Na planilha: **Extensões ▸ Apps Script**.
2. Substitua o conteúdo de `Code.gs` e `Index.html` pelos arquivos desta pasta.
3. Execute uma vez a função **`diagnosticarPlanilha`** e autorize os acessos pedidos
   (planilha, cache, serviço Maps do Google e busca externa para o feed do Waze).
4. **Implantar ▸ Gerenciar implantações ▸ Editar ▸ Nova versão ▸ Implantar**
   (o link `/exec` só muda depois de criar a nova versão; para testar, use o link `/dev`).

## Abas da planilha
| Aba | Uso |
|---|---|
| **ARTICULACAO** | Frações (Cia/Pel/Gp), código de cada fração, município-sede e municípios atendidos. O cruzamento pelo código define toda a área de responsabilidade da fração. Aceita tabelas lado a lado, células mescladas e vários municípios na mesma célula (separados por `;` ou `,`). |
| **STV** | Registros com Latitude/Longitude, Data/Hora, Município, Rodovia, KM e Gravidade/Escore. |
| **BLOQUEIOS** (opcional) | Latitude, Longitude, Tipo (Interdição, Acidente, Obra, Estrangulamento), Rodovia, Descrição. |
| **Mapa Frações** (opcional) | Tipo, Código, Nome, para traduzir códigos. |

As colunas são achadas pelo cabeçalho ou pelo conteúdo. RPM e Cia só aceitam numeração
("01ª RPM", "03ª Cia PMRv"); valores como "Sim/Não", "#######" e "#N/A" são ignorados.

## Funcionalidades
- Filtros em cascata: RPM → Cia → Pelotão → Grupamento → Município (só mostra os subordinados).
- Régua de densidade espacial (100 m a 10 km): reagrupa os hotspots na hora, sem nova consulta.
- Horário: 24 h, turno atual automático, turnos fixos ou período específico (da hora X até a hora Y).
- Ponderação opcional: gravidade × volume e Ponderação Recente (w₂₀₂₆ = 0,6 para os últimos 30/60/90 dias; 0,4 para os demais).
- Rota traçada pelas rodovias dentro do app (Google Directions, ordem otimizada, até 23 paradas),
  limitada por número de pontos e extensão máxima; saída para o Google Maps em trechos encadeados
  (até 9 paradas por link; 3 no celular) e para o Waze parada a parada.
- Cartão do trecho: rodovia/km, município, fração e sede, escore, volume, registros recentes,
  horário de pico, alertas a até 5 km e rotas de acesso com alternativas a partir da sede ou do GPS.
- Alertas na via: aba BLOQUEIOS e, opcionalmente, feed do **Waze for Cities**
  (Propriedades do script ▸ `WAZE_FEED_URL`).

Após alterar a planilha, execute `limparCache` (o cache dura 30 min).
