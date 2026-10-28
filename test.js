const { loadInventory, loadAllProperties, saveAllPropertiesToSpreadsheet } = require('./src/sheets');
const { analyzeMessageAndMatch, formatOutreachMessage } = require('./src/matcher');

async function runTests() {
  // Atualiza a planilha adicionando as novas colunas (regiao, mobiliado) automaticamente nos imóveis atuais
  const all = await loadAllProperties(true);
  await saveAllPropertiesToSpreadsheet(all);

  const inventory = await loadInventory(true);
  console.log(`✅ Carteira carregada e atualizada com ${inventory.length} imóveis.\n`);

  const testCases = [
    'Quero um apartamento de 2 quartos no setor sudoeste até 400 mil',
    'procuro imovel mobiliado em qualquer setor',
    'procuro apartamento mobiliado na regiao sudoeste ate 400.000,00',
    'quero apartamento na regiao sul ate 400.000,00',
    'Gostaria de uma casa com piscina no Jardim América até 650k',
    'Vendo excelente apartamento no Setor Bueno 3 quartos R$ 450.000'
  ];

  for (const msg of testCases) {
    console.log(`----------------------------------------------------------------`);
    console.log(`💬 Mensagem no grupo: "${msg}"`);
    const res = await analyzeMessageAndMatch(msg, 'Cliente Teste', inventory);
    console.log(`🔍 É busca de imóvel? ${res.isLookingForProperty}`);
    if (res.isLookingForProperty) {
      console.log(`🎯 Filtros extraídos:`, res.criteria);
      console.log(
        `🏠 Imóveis encontrados (${res.matches.length}):`,
        res.matches.map(m => `#${m.id} (${m.tipo} - ${m.setor} [${m.regiao}] - Mobiliado:${m.mobiliado} - R$${m.valor})`)
      );
      if (res.matches.length > 0) {
        console.log(`\n📲 Prévia da DM enviada para o cliente:\n${formatOutreachMessage('João', msg, res.matches[0])}`);
      }
    } else {
      console.log(`⏭️ Motivo de ignorar: ${res.reason}`);
    }
  }
}

runTests();
