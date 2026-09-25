# Rota Preventiva (Google Apps Script)

App web da Rota Preventiva / Policiamento Preditivo do Estado-Maior do CPE / PMRv.

## Instalação
1. Na planilha: **Extensões ▸ Apps Script**.
2. Substitua o conteúdo de `Code.gs` e `Index.html` pelos arquivos desta pasta.
3. Execute uma vez a função **`diagnosticarPlanilha`** (autorize o acesso) e confira o Log.
4. **Implantar ▸ Gerenciar implantações ▸ Editar ▸ Nova versão**.

## Como a planilha é lida
As colunas são localizadas **pelo cabeçalho** (a ordem não importa):

| Campo | Cabeçalhos aceitos (sem acento/maiúsculas) |
|---|---|
| RPM | RPM, Região |
| Companhia | Cia, Companhia, Cia PMRv |
| Pelotão | Pelotão, Pel |
| Grupamento | Grupamento, Gp |
| Município | Município, Cidade |
| Coordenadas | Latitude + Longitude, ou uma coluna "Coordenadas" |
| Hora | Hora, Horário, Data/Hora |
| Escore | Escore, Score, Risco |
| Rodovia | Rodovia, BR, Via |

Colunas com "Cód", "Código", "ID", "Nº", "IBGE", "REDS" são tratadas como códigos: nunca aparecem
nos filtros, mas são traduzidas para nome quando a mesma linha (ou a aba **Mapa Frações**, com
colunas `Tipo | Código | Nome`) informa o nome por extenso.

Após alterar a planilha, execute `limparCache` (o cache dura 30 min).
