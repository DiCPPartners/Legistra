/**
 * Script da eseguire nella console del browser per generare embeddings
 * 
 * ISTRUZIONI:
 * 1. Apri l'app Legistra nel browser
 * 2. Accedi con il tuo account
 * 3. Apri la console del browser (F12 → Console)
 * 4. Copia e incolla tutto questo codice nella console
 * 5. Premi Invio
 */

(async function() {
  console.log('🚀 Avvio generazione embeddings...\n')

  // Importa le funzioni necessarie (usa i moduli già caricati nell'app)
  const { fetchAllTemplates, generateAndSaveEmbedding } = await import('./src/services/templates.js')
  const { OPENAI_API_KEY } = await import('./src/config/webhooks.js')

  if (!OPENAI_API_KEY) {
    console.error('❌ Errore: VITE_OPENAI_API_KEY non configurata')
    return
  }

  try {
    // Recupera tutti i template
    const templates = await fetchAllTemplates()
    
    // Filtra solo quelli senza embedding
    const templatesToProcess = templates.filter(
      (t) => t.original_content && t.original_content.trim() && !t.embedding
    )

    if (templatesToProcess.length === 0) {
      console.log('✅ Tutti i template hanno già un embedding!')
      return
    }

    console.log(`📊 Trovati ${templates.length} template totali`)
    console.log(`🔄 ${templatesToProcess.length} template senza embedding da processare\n`)

    let successCount = 0
    let errorCount = 0

    // Processa ogni template
    for (let i = 0; i < templatesToProcess.length; i++) {
      const template = templatesToProcess[i]
      console.log(`[${i + 1}/${templatesToProcess.length}] Processando: ${template.file_name}...`)
      
      try {
        await generateAndSaveEmbedding({
          templateId: template.id,
          apiKey: OPENAI_API_KEY,
          text: template.original_content
        })
        console.log(`✅ Completato: ${template.file_name}`)
        successCount++
      } catch (error) {
        console.error(`❌ Errore per ${template.file_name}:`, error.message)
        errorCount++
      }

      // Piccola pausa per non sovraccaricare l'API
      if (i < templatesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 Riepilogo:')
    console.log(`   ✅ Completati: ${successCount}`)
    console.log(`   ❌ Errori: ${errorCount}`)
    console.log(`   📁 Totali: ${templatesToProcess.length}`)
    console.log('='.repeat(50))
  } catch (error) {
    console.error('❌ Errore fatale:', error)
  }
})()
