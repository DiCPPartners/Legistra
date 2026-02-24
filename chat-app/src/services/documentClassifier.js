/**
 * Servizio per classificazione automatica documenti legali
 */

// Tipi di documento riconosciuti
export const DOCUMENT_TYPES = {
  atto_citazione: {
    label: 'Atto di Citazione',
    description: 'Atto di citazione in giudizio',
    suggestedActions: ['trascrizione', 'analisi-giuridica', 'timeline-eventi', 'estrazione-dati'],
    icon: 'document-legal',
    color: '#3b82f6'
  },
  comparsa_risposta: {
    label: 'Comparsa di Risposta',
    description: 'Comparsa di costituzione e risposta',
    suggestedActions: ['trascrizione', 'estrazione-dati', 'timeline-eventi'],
    icon: 'document',
    color: '#ef4444'
  },
  sentenza: {
    label: 'Sentenza',
    description: 'Sentenza di primo grado, appello o Cassazione',
    suggestedActions: ['trascrizione', 'analisi-giuridica', 'elementi-critici'],
    icon: 'gavel',
    color: '#8b5cf6'
  },
  ordinanza: {
    label: 'Ordinanza',
    description: 'Ordinanza del giudice',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'gavel',
    color: '#10b981'
  },
  contratto: {
    label: 'Contratto',
    description: 'Contratto o accordo tra le parti',
    suggestedActions: ['trascrizione', 'analisi-contrattuale', 'estrazione-dati'],
    icon: 'document',
    color: '#f59e0b'
  },
  perizia_ctu: {
    label: 'Perizia CTU',
    description: "Perizia di Consulente Tecnico d'Ufficio",
    suggestedActions: ['analisi-giuridica', 'analisi-coerenza', 'elementi-critici'],
    icon: 'gavel',
    color: '#6366f1'
  },
  perizia_ctp: {
    label: 'Perizia CTP',
    description: 'Perizia di Consulente Tecnico di Parte',
    suggestedActions: ['analisi-giuridica', 'analisi-coerenza', 'confronto-documenti'],
    icon: 'document-legal',
    color: '#ec4899'
  },
  memoria_difensiva: {
    label: 'Memoria Difensiva',
    description: 'Memoria difensiva o di replica',
    suggestedActions: ['trascrizione', 'analisi-giuridica', 'estrazione-dati'],
    icon: 'document',
    color: '#14b8a6'
  },
  verbale_udienza: {
    label: 'Verbale di Udienza',
    description: 'Verbale di udienza',
    suggestedActions: ['trascrizione', 'timeline-eventi', 'estrazione-dati'],
    icon: 'document',
    color: '#0ea5e9'
  },
  decreto_ingiuntivo: {
    label: 'Decreto Ingiuntivo',
    description: 'Decreto ingiuntivo o ingiunzione di pagamento',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'gavel',
    color: '#22c55e'
  },
  denuncia_querela: {
    label: 'Denuncia/Querela',
    description: 'Denuncia o querela',
    suggestedActions: ['trascrizione', 'diritto-penale', 'timeline-eventi'],
    icon: 'warning',
    color: '#f97316'
  },
  procura: {
    label: 'Procura alle Liti',
    description: 'Procura alle liti o mandato professionale',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'shield',
    color: '#64748b'
  },
  altro: {
    label: 'Altro Documento',
    description: 'Tipo documento non classificato',
    suggestedActions: ['trascrizione'],
    icon: 'document',
    color: '#94a3b8'
  }
}

// Prompt per classificazione AI
const CLASSIFICATION_PROMPT = `Sei un classificatore di documenti legali. Analizza il seguente testo estratto da un documento e classificalo.

TIPI POSSIBILI:
- atto_citazione: Atto di citazione in giudizio (domanda giudiziale, vocatio in ius, attore, convenuto)
- comparsa_risposta: Comparsa di costituzione e risposta (eccezioni, domanda riconvenzionale)
- sentenza: Sentenza (primo grado, appello, Cassazione, P.Q.M., dispositivo)
- ordinanza: Ordinanza del giudice (provvedimento interlocutorio, cautelare)
- contratto: Contratto o accordo tra le parti (clausole, obblighi, corrispettivo)
- perizia_ctu: Perizia di Consulente Tecnico d'Ufficio (nominato dal giudice)
- perizia_ctp: Perizia di Consulente Tecnico di Parte
- memoria_difensiva: Memoria difensiva o di replica (ex art. 183 c.p.c.)
- verbale_udienza: Verbale di udienza (comparizione parti, rinvio)
- decreto_ingiuntivo: Decreto ingiuntivo o ingiunzione di pagamento
- denuncia_querela: Denuncia o querela (reato, persona offesa)
- procura: Procura alle liti o mandato professionale
- altro: Tipo documento non riconosciuto

Rispondi SOLO con un JSON valido nel formato:
{
  "tipo": "tipo_documento",
  "confidenza": 0.95,
  "dettagli": "breve spiegazione della classificazione",
  "elementi_rilevati": ["elemento1", "elemento2"]
}`

// Pattern per classificazione euristica (fallback)
const HEURISTIC_PATTERNS = {
  atto_citazione: [
    /atto di citazione/i,
    /citazione in giudizio/i,
    /attore/i,
    /convenuto/i,
    /R\.?G\.?\s*\d/i
  ],
  comparsa_risposta: [
    /comparsa.*risposta/i,
    /costituzione e risposta/i,
    /eccepisce/i,
    /in via riconvenzionale/i
  ],
  sentenza: [
    /sentenza/i,
    /in nome del popolo/i,
    /P\.Q\.M/i,
    /il giudice/i,
    /il tribunale/i
  ],
  ordinanza: [
    /ordinanza/i,
    /il giudice ordina/i,
    /provvedimento/i
  ],
  contratto: [
    /contratto/i,
    /tra le parti/i,
    /clausol[ae]/i,
    /obblighi/i,
    /corrispettivo/i
  ],
  perizia_ctu: [
    /consulente\s*tecnico\s*d'ufficio/i,
    /ctu/i,
    /nominato\s*dal\s*giudice/i,
    /quesiti\s*peritali/i
  ],
  perizia_ctp: [
    /consulente\s*tecnico\s*di\s*parte/i,
    /ctp/i,
    /nell'interesse\s*di/i,
    /parte\s*attrice/i,
    /parte\s*convenuta/i
  ],
  memoria_difensiva: [
    /memoria\s*(difensiva|di replica|autorizzata)/i,
    /ex\s*art\.\s*183/i,
    /termine\s*perentorio/i
  ],
  verbale_udienza: [
    /verbale.*udienza/i,
    /udienza\s*del/i,
    /il giudice\s*dà atto/i,
    /rinvia.*udienza/i
  ],
  decreto_ingiuntivo: [
    /decreto\s*ingiuntivo/i,
    /ingiunzione/i,
    /pagamento\s*della\s*somma/i
  ],
  denuncia_querela: [
    /denuncia/i,
    /querela/i,
    /persona offesa/i,
    /reato/i,
    /fatto.*reato/i
  ],
  procura: [
    /procura\s*alle\s*liti/i,
    /mandato/i,
    /conferisco\s*mandato/i,
    /delegare/i
  ]
}

/**
 * Classifica un documento usando pattern euristici (veloce, gratuito)
 */
export function classifyDocumentHeuristic(text) {
  if (!text || text.length < 50) {
    return { tipo: 'altro', confidenza: 0.3, metodo: 'heuristic' }
  }
  
  const textLower = text.toLowerCase()
  const scores = {}
  
  for (const [docType, patterns] of Object.entries(HEURISTIC_PATTERNS)) {
    let matchCount = 0
    const matchedPatterns = []
    
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matchCount++
        matchedPatterns.push(pattern.source)
      }
    }
    
    if (matchCount > 0) {
      scores[docType] = {
        score: matchCount / patterns.length,
        matches: matchedPatterns
      }
    }
  }
  
  // Trova il tipo con score più alto
  let bestType = 'altro'
  let bestScore = 0
  let bestMatches = []
  
  for (const [docType, data] of Object.entries(scores)) {
    if (data.score > bestScore) {
      bestScore = data.score
      bestType = docType
      bestMatches = data.matches
    }
  }
  
  return {
    tipo: bestType,
    confidenza: Math.min(bestScore + 0.3, 0.95), // Boost confidence
    elementi_rilevati: bestMatches,
    metodo: 'heuristic'
  }
}

/**
 * Classifica un documento usando AI (più accurato, richiede API key)
 */
export async function classifyDocumentAI(text, apiKey) {
  if (!text || !apiKey) {
    return classifyDocumentHeuristic(text)
  }
  
  // Usa solo le prime 2000 parole per risparmiare token
  const truncatedText = text.split(/\s+/).slice(0, 2000).join(' ')
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CLASSIFICATION_PROMPT },
          { role: 'user', content: `Classifica questo documento:\n\n${truncatedText}` }
        ],
        max_tokens: 200,
        temperature: 0.1
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices[0].message.content
    
    // Parse JSON dalla risposta
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])
      return {
        ...result,
        metodo: 'ai'
      }
    }
    
    throw new Error('Risposta AI non valida')
    
  } catch (error) {
    console.warn('Classificazione AI fallita, uso euristica:', error.message)
    return classifyDocumentHeuristic(text)
  }
}

/**
 * Ottiene azioni suggerite per un tipo di documento
 */
export function getSuggestedActions(documentType) {
  const typeConfig = DOCUMENT_TYPES[documentType] || DOCUMENT_TYPES.altro
  return typeConfig.suggestedActions
}

/**
 * Ottiene configurazione completa tipo documento
 */
export function getDocumentTypeConfig(documentType) {
  return DOCUMENT_TYPES[documentType] || DOCUMENT_TYPES.altro
}

/**
 * Classifica multipli documenti
 */
export async function classifyMultipleDocuments(documents, apiKey = null) {
  const results = []
  
  for (const doc of documents) {
    const classification = apiKey 
      ? await classifyDocumentAI(doc.text, apiKey)
      : classifyDocumentHeuristic(doc.text)
    
    results.push({
      name: doc.name,
      ...classification,
      config: getDocumentTypeConfig(classification.tipo)
    })
  }
  
  return results
}

export default {
  DOCUMENT_TYPES,
  classifyDocumentHeuristic,
  classifyDocumentAI,
  getSuggestedActions,
  getDocumentTypeConfig,
  classifyMultipleDocuments
}
