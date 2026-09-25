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
- Filtros em cascata: Cia → Pelotão → Grupamento → Município (só mostra os subordinados). Sem RPM.
- Três visões: **Locais de acidentes** (histórico), **Predição** (necessidade de operação preventiva)
  e **Somente rotas preditivas**; cada uma em **Cluster** ou **Kernel** (mapa de calor).
- Régua de densidade espacial (100 m a 10 km): raio dos clusters e largura de banda do kernel.
- Modelo preditivo (no navegador, sem nova consulta):
  kernel gaussiano dos registros ponderados por recência (w₂₀₂₆ = 0,6 nos últimos 30/60/90 dias; 0,4 no restante)
  e gravidade (opcionais) × tendência trimestral (últimos 90 dias vs. 90 anteriores, limitada a 0,6–1,8).
  Janela horária de 3 h e dia da semana mais prováveis por ponto (perfil do ponto suavizado pelo da área);
  acidentes esperados em 30 dias; validação retroativa (quanto os N pontos previstos, sem os últimos 90 dias,
  captaram desses 90 dias).
- Síntese da fração: local e horário de maior incidência × local e janela previstos.
- Rota traçada sobre os pontos previstos (Google Directions, ordem otimizada, até 23 paradas),
  limitada por número de pontos e extensão; Google Maps em trechos encadeados e Waze por parada.
- Rodovias: identificadas por geocodificação reversa (cache na aba oculta `_CACHE_RODOVIAS`);
  comparação incidência × predição por rodovia; perfil por km quando a base tiver rodovia e km;
  trechos e km do PLANO_RODOVIARIO.
- Cartão do trecho, rotas de acesso com alternativas, alertas (aba BLOQUEIOS / Waze for Cities) e GPS.

Após alterar a planilha, execute `limparCache` (o cache dura 30 min).
