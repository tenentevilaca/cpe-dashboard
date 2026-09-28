# Rota Preventiva (Google Apps Script)

App web da Rota Preventiva / Policiamento Preditivo do Estado-Maior do CPE / PMRv.

## Instalação
1. Na planilha: **Extensões ▸ Apps Script**.
2. Substitua o conteúdo de `Code.gs` e `Index.html` pelos arquivos desta pasta e crie o arquivo HTML
   `Tutorial` com o conteúdo de `Tutorial.html` (o manual, aberto pelo botão 📘 Tutorial do app ou
   pelo endereço do app com `?pagina=tutorial`).
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
- **Dois ambientes.** *Efetivo* (padrão, sem login): só fração, horário e **📋 Gerar cartão programa**;
  o mapa mostra apenas a rota do dia e o Cartão programa (paradas, horários, Google Maps/Waze, impressão).
  A rota é a do gestor, se houver plano em vigor, ou a rota preditiva otimizada do sistema.
  *Gestão* (após login na aba 🛡 Gestão): todas as opções abaixo, mais o botão **Ver como o efetivo**.
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
- **Postos de operação** (visão Predição, padrão da rota): problema de cobertura máxima (MCLP) sobre a rede
  viária montada com os trechos calibrados do plano rodoviário (com entroncamentos detectados). Escolhe de 2 a 8
  postos que alcançam o máximo de acidentes previstos a até 2–15 km **pela rodovia**, sem sobreposição; cada posto
  tem horário ideal e permanência sugerida proporcional ao que cobre. A rota passa pelos postos
  (ou pelos pontos previstos, na estratégia “Percorrer os pontos previstos”).
- **Gestão** (aba 🛡, acesso por senha): o administrador define a própria senha pelo menu da planilha
  *Rota Preventiva ▸ Definir senha do administrador* (ou a propriedade do script `ADMIN_SENHA`; usuário `admin`) e autoriza gestores por área
  (Cia/Pelotão/Grupamento), com senha provisória trocada no primeiro acesso. O gestor cria a rota da fração:
  parte da sugestão do sistema, inclui pontos no mapa (clique, arraste, busca de endereço), define ponto base
  × passagem, a operação e o horário (ex.: 13:00–14:00), e a vigência (um dia, uma semana, um mês, um ano ou
  período, com dias da semana). Enquanto vigente, **a rota do gestor prevalece** sobre a do sistema para quem
  gerar a rota daquela fração; sem plano, vale a do sistema. Dados nas abas ocultas `_GESTORES` (senhas com hash
  e sal) e `_PLANOS_GESTOR`.
- Cartão do trecho, rotas de acesso com alternativas, alertas (aba BLOQUEIOS / Waze for Cities) e GPS.

## Aprendizagem de máquina (sem custo, no navegador)
- **Onde** (acidentes em 30 dias por trecho de 1 km): Gradient Boosting com perda de Poisson,
  regressão Binomial Negativa e a regra w₂₀₂₆. Validação retroativa em 3 janelas (últimos 30/60/90 dias);
  o modo automático usa o de maior acerto nos N trechos principais. Placar na aba **Modelo**.
- **Quando**: regressão de Poisson por dia × faixa de 3 h × região, com calendário brasileiro
  (feriados fixos e móveis, vésperas, férias) e chuva.
- **Clima**: chuva horária do **Open-Meteo** (gratuito, sem cadastro, uso não comercial). O efeito é testado com
  intervalo de 95%, descontando dia, horário e região; só entra na previsão se for comprovado.
- **Próximos 7 dias**: risco por faixa horária (calendário + chuva prevista, quando comprovada).
- **ST-DBSCAN** (1 km, 30 dias, mínimo 4): ativo, emergente, em queda, controlado, esporádico; a rota pode excluir os controlados.

## Km dos acidentes e malha sob responsabilidade
A DADOS_STV não traz rodovia nem km. O app deduz os dois a partir do **PLANO_RODOVIARIO**:
1. **Calibração** (uma vez; botão "Calibrar agora" no app ou função `calibrarPlanoRodoviario` no editor):
   para cada trecho, localiza início e fim — pelas colunas **Lat/Long Início** e **Lat/Long Fim**, se existirem
   (recomendado, exato), ou pela Descrição Início/Fim + município — e obtém do Google o traçado viário
   entre eles. O comprimento do traçado é conferido com Fim − Início (aceito entre 75% e 135%).
   O resultado fica na aba oculta `_CACHE_PLANO` (status `ok`, `revisar` ou `falha`). Se o tempo acabar,
   a calibração continua sozinha em segundo plano.
2. **Projeção**: cada acidente a até 300 m de um trecho calibrado recebe **rodovia e km**
   (proporcional à extensão oficial Início–Fim) e é marcado como **dentro da malha PMRv**; os demais, fora.
3. O marcador "Somente acidentes na malha PMRv" restringe a análise, a predição e a rota à malha.

Trechos com status `revisar`/`falha`: preencha as coordenadas de início e fim no plano e rode
`calibrarPlanoRodoviario(true)` para refazê-los.

Após alterar a planilha, execute `limparCache` (o cache dura 30 min).
