/**
 * ============================================================================
 * MAPA DE GOIÂNIA E REGIÃO METROPOLITANA (o "GPS" do cérebro da secretária)
 * ============================================================================
 * - BAIRROS: nome oficial, apelidos usados nos grupos, região e coordenada aproximada
 *   (centro do bairro). As coordenadas servem para achar bairros VIZINHOS quando o
 *   corretor escreve "região da Praça Tamandaré", "perto do DETRAN", etc.
 * - MARCOS: praças, shoppings, parques, órgãos públicos e avenidas famosas.
 * - CONDOMÍNIOS e EDIFÍCIOS: nomes próprios. São comparados LITERALMENTE com o
 *   cadastro do imóvel (campo "edificio" ou descrição) — nunca por região.
 * - CIDADES: municípios próximos com coordenada, para pedidos como
 *   "chácara num raio de 40 km de Goiânia".
 *
 * Coordenadas são aproximadas (precisão de bairro). Você pode adicionar lugares
 * novos pelo painel (aba Cérebro) sem mexer aqui.
 * ============================================================================
 */

const REGIOES = ['Sul', 'Sudoeste', 'Oeste', 'Noroeste', 'Norte', 'Leste', 'Central', 'Sudeste'];

// [nome oficial, região, lat, lng, apelidos...]
const BAIRROS_RAW = [
  // ---------------- REGIÃO SUL ----------------
  ['Setor Bueno', 'Sul', -16.7050, -49.2720, 'bueno', 'st bueno'],
  ['Setor Marista', 'Sul', -16.7000, -49.2610, 'marista'],
  ['Setor Bela Vista', 'Sul', -16.7150, -49.2560, 'bela vista'],
  ['Setor Pedro Ludovico', 'Sul', -16.7210, -49.2470, 'pedro ludovico'],
  ['Jardim Goiás', 'Sul', -16.7090, -49.2380, 'jd goias', 'jardim goias'],
  ['Alto da Glória', 'Sul', -16.7230, -49.2350, 'alto da gloria'],
  ['Setor Nova Suíça', 'Sul', -16.7080, -49.2830, 'nova suica'],
  ['Setor Serrinha', 'Sul', -16.7200, -49.2630, 'serrinha'],
  ['Jardim América', 'Sul', -16.7250, -49.2790, 'jd america', 'jardim america'],
  ['Parque Amazônia', 'Sul', -16.7360, -49.2700, 'pq amazonia', 'parque amazonia', 'amazonia'],
  ['Vila Rosa', 'Sul', -16.7420, -49.2950],
  ['Jardim Atlântico', 'Sul', -16.7470, -49.2840, 'jardim atlantico'],
  ['Parque Anhanguera', 'Sul', -16.7260, -49.3010, 'pq anhanguera'],
  ['Setor Jardim da Luz', 'Sul', -16.7110, -49.2470, 'jardim da luz'],
  ['Vila Redenção', 'Sul', -16.7300, -49.2450, 'vila redencao'],
  ['Parque Atheneu', 'Sudeste', -16.7180, -49.2080, 'atheneu'],
  ['Setor Areião', 'Sul', -16.7130, -49.2530, 'areiao'],
  ['Parque Lozandes', 'Sul', -16.7180, -49.2200, 'lozandes', 'pq lozandes'],
  ['Jardim Maria Helena', 'Sul', -16.7600, -49.2950],
  ['Setor Rio Formoso', 'Sul', -16.7530, -49.2700, 'rio formoso'],
  ['Parque Santa Rita', 'Sul', -16.7680, -49.2850],
  ['Vila Maria José', 'Sul', -16.7330, -49.2600],
  ['Jardim Bela Vista', 'Sul', -16.7380, -49.2560],

  // ---------------- REGIÃO SUDOESTE ----------------
  ['Setor Sudoeste', 'Sudoeste', -16.7120, -49.2930, 'sudoeste', 'st sudoeste'],
  ['Jardim Europa', 'Sudoeste', -16.7300, -49.2960, 'jd europa'],
  ['Residencial Eldorado', 'Sudoeste', -16.7140, -49.3200, 'eldorado'],
  ['Setor Faiçalville', 'Sudoeste', -16.7530, -49.3000, 'faicalville', 'faical'],
  ['Jardim Planalto', 'Sudoeste', -16.7200, -49.3120],
  ['Celina Park', 'Sudoeste', -16.7300, -49.3110],
  ['Parque Oeste Industrial', 'Sudoeste', -16.7400, -49.3150, 'parque oeste industrial'],
  ['Jardim Presidente', 'Sudoeste', -16.7480, -49.3020],
  ['Vila Alpes', 'Sudoeste', -16.7180, -49.3050, 'vila alps'],
  ['Setor Garavelo', 'Sudoeste', -16.7700, -49.3100, 'garavelo'],
  ['Jardim Vila Boa', 'Sudoeste', -16.7270, -49.3040],
  ['Parque das Laranjeiras', 'Sudoeste', -16.7550, -49.3200],
  ['Residencial Granville', 'Sudoeste', -16.7050, -49.3380, 'granville'],
  ['Novo Horizonte', 'Sudoeste', -16.7400, -49.3300],
  ['Vila Mauá', 'Sudoeste', -16.7050, -49.3000, 'vila maua'],
  ['Parque Industrial João Braz', 'Sudoeste', -16.7550, -49.3350, 'joao braz'],
  ['Jardim Marques de Abreu', 'Sudoeste', -16.7150, -49.3050],
  ['Residencial Itaipu', 'Sudoeste', -16.7650, -49.3250, 'itaipu'],

  // ---------------- REGIÃO OESTE ----------------
  ['Setor Oeste', 'Oeste', -16.6810, -49.2690, 'st oeste', 'oeste'],
  ['Cidade Jardim', 'Oeste', -16.6950, -49.3050],
  ['Setor Coimbra', 'Oeste', -16.6830, -49.2870, 'coimbra'],
  ['Parque Oeste', 'Oeste', -16.6950, -49.3200],
  ['Setor Novo Horizonte', 'Oeste', -16.6880, -49.3100],
  ['Setor dos Funcionários', 'Oeste', -16.6600, -49.2760, 'funcionarios'],
  ['Setor Aeroviário', 'Oeste', -16.6660, -49.2860, 'aeroviario'],
  ['Setor Campinas', 'Oeste', -16.6690, -49.2920, 'campinas'],
  ['Vila Canaã', 'Oeste', -16.6850, -49.3000, 'vila canaa'],
  ['Setor Rodoviário', 'Oeste', -16.6620, -49.2950, 'rodoviario'],
  ['Setor Castelo Branco', 'Oeste', -16.6600, -49.3100, 'castelo branco'],
  ['Vila Aurora', 'Oeste', -16.6600, -49.2900],
  ['Setor Esplanada do Anicuns', 'Oeste', -16.6750, -49.3050, 'esplanada do anicuns'],
  ['Setor Ipiranga', 'Oeste', -16.6500, -49.2950, 'ipiranga'],
  ['Jardim Petrópolis', 'Oeste', -16.6450, -49.3200, 'jardim petropolis'],
  ['Capuava', 'Oeste', -16.6450, -49.3050],
  ['Setor Cândida de Morais', 'Noroeste', -16.6300, -49.3050, 'candida de morais'],
  ['Bairro Ipiranga', 'Oeste', -16.6500, -49.2950],
  ['Setor Aeroporto', 'Central', -16.6720, -49.2750, 'aeroporto'],

  // ---------------- REGIÃO CENTRAL ----------------
  ['Setor Central', 'Central', -16.6800, -49.2550, 'centro', 'centro de goiania'],
  ['Setor Sul', 'Central', -16.6930, -49.2560],
  ['Setor Universitário', 'Leste', -16.6800, -49.2420, 'universitario', 'st universitario'],
  ['Setor Leste Universitário', 'Leste', -16.6800, -49.2330, 'leste universitario'],
  ['Setor Leste Vila Nova', 'Leste', -16.6680, -49.2340, 'leste vila nova'],
  ['Vila Nova', 'Leste', -16.6720, -49.2420, 'setor vila nova'],
  ['Setor Norte Ferroviário', 'Central', -16.6590, -49.2600, 'norte ferroviario'],
  ['Setor Marechal Rondon', 'Central', -16.6530, -49.2560, 'marechal rondon'],
  ['Setor Centro Oeste', 'Central', -16.6650, -49.2670, 'centro oeste'],
  ['Setor Crimeia Oeste', 'Central', -16.6550, -49.2700, 'crimeia oeste'],
  ['Setor Crimeia Leste', 'Central', -16.6550, -49.2600, 'crimeia leste'],
  ['Setor Pedro Ludovico Teixeira', 'Sul', -16.7210, -49.2470],
  ['Vila Jaraguá', 'Central', -16.6620, -49.2730, 'vila jaragua'],
  ['Setor Norte', 'Central', -16.6650, -49.2550],

  // ---------------- REGIÃO LESTE / SUDESTE ----------------
  ['Jardim Novo Mundo', 'Leste', -16.6680, -49.2150, 'novo mundo'],
  ['Setor Água Branca', 'Leste', -16.6900, -49.2200, 'agua branca'],
  ['Parque das Amendoeiras', 'Leste', -16.6800, -49.2000],
  ['Jardim Brasil', 'Leste', -16.6400, -49.2150],
  ['Jardim Califórnia', 'Leste', -16.6550, -49.2050, 'jardim california'],
  ['Setor Recanto das Minas Gerais', 'Leste', -16.6400, -49.2000, 'recanto das minas gerais'],
  ['Vila Pedroso', 'Leste', -16.6650, -49.1850],
  ['Setor Sevene', 'Leste', -16.6900, -49.2000],
  ['Parque Flamboyant', 'Sul', -16.7150, -49.2300, 'flamboyant'],
  ['Residencial Aruanã', 'Leste', -16.7000, -49.2050, 'aruana', 'aruana i', 'aruana ii'],
  ['Jardim Mariliza', 'Sudeste', -16.7350, -49.2250],
  ['Parque Acalanto', 'Sudeste', -16.7400, -49.2050],
  ['Jardim das Esmeraldas', 'Sudeste', -16.7380, -49.2150],
  ['Setor Pedro Ludovico Leste', 'Sudeste', -16.7300, -49.2350],
  ['Jardim Ana Lúcia', 'Sudoeste', -16.7050, -49.3080, 'ana lucia'],

  // ---------------- REGIÃO NORTE ----------------
  ['Setor Jaó', 'Norte', -16.6450, -49.2280, 'jao'],
  ['Setor Santa Genoveva', 'Norte', -16.6380, -49.2450, 'santa genoveva'],
  ['Setor Urias Magalhães', 'Norte', -16.6340, -49.2660, 'urias magalhaes'],
  ['Setor Negrão de Lima', 'Norte', -16.6540, -49.2350, 'negrao de lima'],
  ['Goiânia 2', 'Norte', -16.6250, -49.2430, 'goiania 2', 'goiania ii'],
  ['Jardim Guanabara', 'Norte', -16.6200, -49.2560, 'guanabara'],
  ['Vila Itatiaia', 'Norte', -16.6050, -49.2600, 'itatiaia'],
  ['Residencial Humaitá', 'Norte', -16.6150, -49.2750, 'humaita'],
  ['Jardim Balneário Meia Ponte', 'Norte', -16.6100, -49.2650, 'balneario meia ponte'],
  ['Setor Perim', 'Norte', -16.6400, -49.2800, 'perim'],
  ['Parque Tremendão', 'Noroeste', -16.6150, -49.3200, 'tremendao'],
  ['Jardim Curitiba', 'Noroeste', -16.6000, -49.3300],
  ['Setor Finsocial', 'Noroeste', -16.6300, -49.3300, 'finsocial'],
  ['Vila Mutirão', 'Noroeste', -16.6150, -49.3150, 'mutirao'],
  ['Setor Morada do Sol', 'Noroeste', -16.6200, -49.3400, 'morada do sol'],
  ['Residencial Vale dos Sonhos', 'Noroeste', -16.6000, -49.3500],
  ['Setor Gentil Meireles', 'Norte', -16.6400, -49.2900, 'gentil meireles'],
  ['Jardim Nova Esperança', 'Noroeste', -16.6400, -49.3300, 'nova esperanca'],
  ['Setor Goiânia Viva', 'Norte', -16.6000, -49.2400, 'goiania viva'],
  ['Residencial Itamaracá', 'Norte', -16.5950, -49.2700]
];

// Condomínios horizontais fechados e bairros planejados (nomes próprios)
// [nome, região/cidade aproximada, apelidos...]
const CONDOMINIOS_RAW = [
  ['Alphaville Flamboyant', 'Sul', 'alphaville', 'alpha flamboyant', 'alphaville flamboyant'],
  ['Alphaville Araguaia', 'Sul', 'alphaville araguaia', 'alpha araguaia'],
  ['Alphaville Ipês', 'Sul', 'alphaville ipes', 'alpha ipes'],
  ['Alphaville Cruzeiro do Sul', 'Sul', 'alphaville cruzeiro', 'alpha cruzeiro'],
  ['Aldeia do Vale', 'Norte', 'aldeia do vale', 'aldeia'],
  ['Portal do Sol', 'Sul', 'portal do sol', 'portal do sol i', 'portal do sol ii', 'portal 1', 'portal 2'],
  ['Jardins Atenas', 'Sul', 'jardins atenas', 'atenas'],
  ['Jardins Paris', 'Sul', 'jardins paris'],
  ['Jardins Mônaco', 'Sul', 'jardins monaco', 'monaco'],
  ['Jardins Viena', 'Sul', 'jardins viena', 'viena'],
  ['Jardins Madri', 'Sul', 'jardins madri', 'jardins madrid', 'madri'],
  ['Jardins Lisboa', 'Sul', 'jardins lisboa', 'lisboa'],
  ['Jardins Milão', 'Sul', 'jardins milao', 'milao'],
  ['Jardins Verona', 'Sul', 'jardins verona', 'verona'],
  ['Jardins Valência', 'Sul', 'jardins valencia', 'valencia'],
  ['Jardins Parma', 'Sul', 'jardins parma', 'parma'],
  ['Jardins Lyon', 'Sul', 'jardins lyon', 'lyon'],
  ['Jardins Marselha', 'Sul', 'jardins marselha', 'marselha'],
  ['Jardins Munique', 'Sul', 'jardins munique', 'munique'],
  ['Jardins Florença', 'Sul', 'jardins florenca', 'florenca'],
  ['Jardins Barcelona', 'Sul', 'jardins barcelona', 'barcelona'],
  ['Jardins Bolonha', 'Sul', 'jardins bolonha', 'bolonha'],
  ['Jardins Capri', 'Sul', 'jardins capri', 'capri'],
  ['Jardins Lugano', 'Sul', 'jardins lugano', 'lugano'],
  ['Residencial Granville', 'Sudoeste', 'granville'],
  ['Condomínio do Lago', 'Sul', 'condominio do lago'],
  ['Residencial Goiânia Golfe Clube', 'Sul', 'golfe clube', 'golf club', 'goiania golfe'],
  ['Condomínio Terras Alpha', 'Sul', 'terras alpha'],
  ['Condomínio Amin Camargo', 'Sul', 'amin camargo'],
  ['Residencial Alphaville Residencial', 'Sul', 'alphaville residencial'],
  ['Condomínio Privê Atlântico', 'Sul', 'prive atlantico'],
  ['Condomínio Ilhas do Caribe', 'Sul', 'ilhas do caribe'],
  ['Condomínio Jardins do Cerrado', 'Sudoeste', 'jardins do cerrado'],
  ['Condomínio Residencial Cidade Verde', 'Sul', 'cidade verde', 'residencial cidade verde'],
  ['Condomínio Royal Park', 'Sul', 'royal park'],
  ['Condomínio Vale das Brisas', 'Sul', 'vale das brisas'],
  ['Condomínio Mansões do Campus', 'Norte', 'mansoes do campus'],
  ['Condomínio Residencial Aldeia dos Buritis', 'Sul', 'aldeia dos buritis'],
  ['Condomínio Polinésia', 'Sul', 'polinesia'],
  ['Condomínio Jardim Itália', 'Sul', 'jardim italia'],
  ['Condomínio Residencial Park Lozandes', 'Sul', 'park lozandes']
];

// Marcos de referência: [nome, bairro onde fica, apelidos...]
const MARCOS_RAW = [
  ['Praça Tamandaré', 'Setor Oeste', 'praca tamandare', 'tamandare'],
  ['Praça Cívica', 'Setor Central', 'praca civica'],
  ['Praça do Sol', 'Setor Oeste', 'praca do sol'],
  ['Praça T-23', 'Setor Bueno', 'praca t23', 'praca t 23', 'praca t-23'],
  ['Praça do Ratinho', 'Setor Coimbra', 'praca do ratinho'],
  ['Praça da Bíblia', 'Setor Leste Universitário', 'praca da biblia'],
  ['Praça Universitária', 'Setor Universitário', 'praca universitaria'],
  ['Praça Walter Santos', 'Setor Coimbra', 'praca walter santos'],
  ['Praça A', 'Setor Campinas', 'praca a'],
  ['Parque Vaca Brava', 'Setor Bueno', 'vaca brava'],
  ['Lago das Rosas', 'Setor Oeste', 'lago das rosas'],
  ['Bosque dos Buritis', 'Setor Oeste', 'bosque dos buritis'],
  ['Parque Areião', 'Setor Pedro Ludovico', 'parque areiao'],
  ['Parque Flamboyant (lago)', 'Jardim Goiás', 'parque flamboyant', 'lago do flamboyant'],
  ['Parque Cascavel', 'Jardim Atlântico', 'parque cascavel', 'cascavel'],
  ['Parque Leolídio di Ramos Caiado', 'Setor Jaó', 'parque leolidio'],
  ['Shopping Flamboyant', 'Jardim Goiás', 'shopping flamboyant', 'flamboyant shopping'],
  ['Goiânia Shopping', 'Setor Bueno', 'goiania shopping'],
  ['Shopping Bougainville', 'Setor Marista', 'bougainville', 'shopping bougainville'],
  ['Shopping Buena Vista', 'Setor Bueno', 'buena vista'],
  ['Shopping Passeio das Águas', 'Setor Santa Genoveva', 'passeio das aguas'],
  ['Portal Shopping', 'Setor Faiçalville', 'portal shopping'],
  ['Shopping Cerrado', 'Setor Campinas', 'shopping cerrado'],
  ['Shopping Estação Goiânia', 'Setor Norte Ferroviário', 'estacao goiania'],
  ['Buriti Shopping', 'Aparecida de Goiânia', 'buriti shopping'],
  ['Shopping Plaza D\'Oro', 'Setor Marista', 'plaza doro', 'plaza d oro'],
  ['DETRAN-GO', 'Cidade Jardim', 'detran', 'detran go'],
  ['Estádio Serra Dourada', 'Jardim Goiás', 'serra dourada'],
  ['Estádio Olímpico', 'Setor Central', 'estadio olimpico'],
  ['Rodoviária de Goiânia', 'Setor Norte Ferroviário', 'rodoviaria'],
  ['Aeroporto Santa Genoveva', 'Setor Santa Genoveva', 'aeroporto santa genoveva', 'aeroporto de goiania'],
  ['PUC Goiás', 'Setor Universitário', 'puc', 'puc goias'],
  ['UFG Campus Samambaia', 'Vila Itatiaia', 'ufg', 'campus samambaia'],
  ['Hospital das Clínicas', 'Setor Leste Universitário', 'hospital das clinicas'],
  ['HUGO', 'Setor Pedro Ludovico', 'hospital hugo'],
  ['Mercado Central', 'Setor Central', 'mercado central'],
  ['Feira Hippie', 'Setor Norte Ferroviário', 'feira hippie'],
  ['Assembleia Legislativa', 'Parque Lozandes', 'assembleia legislativa'],
  ['Paço Municipal', 'Parque Lozandes', 'paco municipal', 'prefeitura de goiania'],
  ['Autódromo de Goiânia', 'Parque Atheneu', 'autodromo'],
  ['Jockey Club', 'Setor Central', 'jockey'],
  ['Clube Jaó', 'Setor Jaó', 'clube jao'],
  // Avenidas: apontam para o bairro principal por onde passam
  ['Avenida T-63', 'Setor Bueno', 't63', 't 63', 't-63', 'avenida t63'],
  ['Avenida T-4', 'Setor Bueno', 't4', 't 4', 'avenida t4'],
  ['Avenida T-7', 'Setor Bueno', 't7', 'avenida t7'],
  ['Avenida T-9', 'Setor Bueno', 't9', 'avenida t9'],
  ['Avenida T-10', 'Setor Bueno', 't10', 'avenida t10'],
  ['Avenida 85', 'Setor Marista', 'avenida 85', 'av 85'],
  ['Avenida Ricardo Paranhos', 'Setor Marista', 'ricardo paranhos'],
  ['Avenida Jamel Cecílio', 'Jardim Goiás', 'jamel cecilio'],
  ['Avenida E', 'Jardim Goiás', 'avenida e'],
  ['Avenida Assis Chateaubriand', 'Setor Oeste', 'assis chateaubriand'],
  ['Avenida República do Líbano', 'Setor Oeste', 'republica do libano'],
  ['Avenida Portugal', 'Setor Marista', 'avenida portugal'],
  ['Avenida D', 'Setor Oeste', 'avenida d'],
  ['Avenida Mutirão', 'Setor Bueno', 'avenida mutirao'],
  ['Avenida Castelo Branco', 'Setor Coimbra', 'avenida castelo branco'],
  ['Avenida Anhanguera', 'Setor Central', 'anhanguera', 'avenida anhanguera'],
  ['Avenida Goiás', 'Setor Central', 'avenida goias'],
  ['Avenida Independência', 'Setor Central', 'avenida independencia'],
  ['Avenida Perimetral Norte', 'Setor Urias Magalhães', 'perimetral norte'],
  ['Avenida Rio Verde', 'Vila Rosa', 'avenida rio verde', 'av rio verde'],
  ['Avenida Atílio Correia Lima', 'Cidade Jardim', 'atilio correia lima'],
  ['Avenida Marechal Rondon', 'Setor Marechal Rondon', 'avenida marechal rondon'],
  ['Avenida Fued José Sebba', 'Jardim Goiás', 'fued jose sebba'],
  ['Avenida Alameda Ricardo Paranhos', 'Setor Marista', 'alameda ricardo paranhos'],
  ['Marginal Botafogo', 'Setor Sul', 'marginal botafogo', 'botafogo']
];

// Municípios: [nome, lat, lng, apelidos...]
const CIDADES_RAW = [
  ['Goiânia', -16.6869, -49.2648, 'goiania', 'gyn'],
  ['Aparecida de Goiânia', -16.8198, -49.2469, 'aparecida de goiania', 'aparecida'],
  ['Senador Canedo', -16.7084, -49.0914, 'senador canedo', 'canedo'],
  ['Trindade', -16.6517, -49.4927, 'trindade'],
  ['Goianira', -16.4947, -49.4262, 'goianira'],
  ['Nerópolis', -16.4047, -49.2227, 'neropolis'],
  ['Hidrolândia', -16.9626, -49.2265, 'hidrolandia'],
  ['Bela Vista de Goiás', -16.9728, -48.9533, 'bela vista de goias'],
  ['Guapó', -16.8297, -49.5319, 'guapo'],
  ['Abadia de Goiás', -16.7573, -49.4412, 'abadia de goias', 'abadia'],
  ['Bonfinópolis', -16.6173, -48.9616, 'bonfinopolis'],
  ['Caldazinha', -16.7117, -49.0013, 'caldazinha'],
  ['Santo Antônio de Goiás', -16.4815, -49.3096, 'santo antonio de goias'],
  ['Inhumas', -16.3611, -49.4961, 'inhumas'],
  ['Brazabrantes', -16.4283, -49.3863, 'brazabrantes'],
  ['Terezópolis de Goiás', -16.4717, -49.0794, 'terezopolis'],
  ['Goianápolis', -16.5098, -49.0234, 'goianapolis'],
  ['Aragoiânia', -16.9087, -49.4476, 'aragoiania'],
  ['Nova Veneza', -16.3695, -49.3168, 'nova veneza'],
  ['Anápolis', -16.3281, -48.9534, 'anapolis'],
  ['Leopoldo de Bulhões', -16.6190, -48.7440, 'leopoldo de bulhoes'],
  ['Piracanjuba', -17.3020, -49.0170, 'piracanjuba'],
  ['Pirenópolis', -15.8507, -48.9592, 'pirenopolis'],
  ['Caldas Novas', -17.7441, -48.6250, 'caldas novas'],
  ['Rio Quente', -17.7740, -48.7590, 'rio quente'],
  ['Brasília', -15.7939, -47.8828, 'brasilia']
];

function buildEntries() {
  const bairros = BAIRROS_RAW.map(([name, region, lat, lng, ...aliases]) => ({
    kind: 'bairro',
    name,
    region,
    city: 'Goiânia',
    lat,
    lng,
    aliases: [...new Set([name, ...aliases])]
  }));

  const byName = new Map(bairros.map(b => [b.name, b]));

  const condominios = CONDOMINIOS_RAW.map(([name, region, ...aliases]) => ({
    kind: 'condominio',
    name,
    region,
    aliases: [...new Set([name, ...aliases])]
  }));

  const marcos = MARCOS_RAW.map(([name, bairroName, ...aliases]) => {
    const b = byName.get(bairroName);
    return {
      kind: 'marco',
      name,
      bairro: bairroName,
      region: b ? b.region : null,
      lat: b ? b.lat : null,
      lng: b ? b.lng : null,
      aliases: [...new Set([name, ...aliases])]
    };
  });

  const cidades = CIDADES_RAW.map(([name, lat, lng, ...aliases]) => ({
    kind: 'cidade',
    name,
    lat,
    lng,
    aliases: [...new Set([name, ...aliases])]
  }));

  return { bairros, condominios, marcos, cidades };
}

module.exports = {
  REGIOES,
  buildEntries,
  GOIANIA_CENTER: { lat: -16.6869, lng: -49.2648 }
};
