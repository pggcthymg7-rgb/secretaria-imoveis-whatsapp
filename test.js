const { loadInventory } = require('./src/sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('./src/matcher');

async function runTests() {
  const inventory = await loadInventory();
  console.log(`✅ Carteira carregada com ${inventory.length} imóveis.\n`);

  const testCases = [
    'busco apartamento de 3 quartos no setor bueno até R$500.000,00',
    'Pessoal, preciso de ap 3q no Bueno com pelo menos 85m2 até 500mil',
    'Procuro apartamento 3 quartos 90m Setor Bueno max 500.000',
    'Alguém tem casa 3q no Jardim América até 650k?',
    'Vendo excelente apartamento no Setor Bueno 3 quartos R$ 450.000' // Deve ignorar pois é oferta ("Vendo")
  ];

  for (const msg of testCases) {
    console.log(`----------------------------------------------------------------`);
    console.log(`💬 Mensagem no grupo: "${msg}"`);
    const res = await analyzeMessageAndMatch(msg, 'Cliente Teste', inventory);
    console.log(`🔍 É busca de imóvel? ${res.isLookingForProperty}`);
    if (res.isLookingForProperty) {
      console.log(`🎯 Filtros extraídos:`, res.criteria);
      console.log(`🏠 Imóveis encontrados (${res.matches.length}):`, res.matches.map(m => `#${m.id} (${m.tipo} - ${m.setor} - R$${m.valor})`));
      if (res.matches.length > 0) {
        console.log(`\n📲 Prévia da DM enviada para o cliente:\n${formatOutreachMessage('João', msg, res.matches[0], res.customGreeting)}`);
      }
    } else {
      console.log(`⏭️ Motivo de ignorar: ${res.reason}`);
    }
  }
}

runTests();
