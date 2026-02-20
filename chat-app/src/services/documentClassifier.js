/**
 * Servizio per classificazione automatica documenti medico-legali
 */

// Tipi di documento riconosciuti
export const DOCUMENT_TYPES = {
  cartella_clinica: {
    label: 'Cartella Clinica',
    description: 'Cartella clinica ospedaliera completa',
    suggestedActions: ['trascrizione', 'analisi-medico-legale', 'timeline-eventi', 'estrazione-dati'],
    icon: 'folder-medical',
    color: '#3b82f6'
  },
  referto_pronto_soccorso: {
    label: 'Referto Pronto Soccorso',
    description: 'Verbale o referto di Pronto Soccorso',
    suggestedActions: ['trascrizione', 'estrazione-dati', 'timeline-eventi'],
    icon: 'emergency',
    color: '#ef4444'
  },
  referto_radiologico: {
    label: 'Referto Radiologico',
    description: 'Referto di esami radiologici (RX, TAC, RM)',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'scan',
    color: '#8b5cf6'
  },
  referto_laboratorio: {
    label: 'Esami di Laboratorio',
    description: 'Esami del sangue, urine, etc.',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'test-tube',
    color: '#10b981'
  },
  certificato_medico: {
    label: 'Certificato Medico',
    description: 'Certificato medico generico o specialistico',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'certificate',
    color: '#f59e0b'
  },
  perizia_ctu: {
    label: 'Perizia CTU',
    description: 'Perizia di Consulente Tecnico d\'Ufficio',
    suggestedActions: ['analisi-medico-legale', 'analisi-coerenza', 'elementi-critici'],
    icon: 'gavel',
    color: '#6366f1'
  },
  perizia_ctp: {
    label: 'Perizia CTP',
    description: 'Perizia di Consulente Tecnico di Parte',
    suggestedActions: ['analisi-medico-legale', 'analisi-coerenza', 'confronto-documenti'],
    icon: 'document-legal',
    color: '#ec4899'
  },
  verbale_commissione: {
    label: 'Verbale Commissione',
    description: 'Verbale commissione invalidità',
    suggestedActions: ['trascrizione', 'invalidita-civile', 'estrazione-dati'],
    icon: 'users',
    color: '#14b8a6'
  },
  lettera_dimissione: {
    label: 'Lettera di Dimissione',
    description: 'Lettera di dimissione ospedaliera',
    suggestedActions: ['trascrizione', 'timeline-eventi', 'estrazione-dati'],
    icon: 'logout',
    color: '#0ea5e9'
  },
  referto_specialistico: {
    label: 'Referto Specialistico',
    description: 'Referto visita specialistica',
    suggestedActions: ['trascrizione', 'estrazione-dati'],
    icon: 'stethoscope',
    color: '#22c55e'
  },
  denuncia_infortunio: {
    label: 'Denuncia Infortunio',
    description: 'Denuncia di infortunio sul lavoro',
    suggestedActions: ['trascrizione', 'infortunistica', 'timeline-eventi'],
    icon: 'warning',
    color: '#f97316'
  },
  polizza_assicurativa: {
    label: 'Polizza Assicurativa',
    description: 'Documentazione assicurativa',
    suggestedActions: ['trascrizione', 'analisi-legale-assicurativa'],
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
const CLASSIFICATION_PROMPT = `Sei un classificatore di documenti medico-legali. Analizza il seguente testo estratto da un documento e classificalo.

TIPI POSSIBILI:
- cartella_clinica: Cartella clinica ospedaliera (diario clinico, anamnesi, esami obiettivi)
- referto_pronto_soccorso: Verbale o referto di Pronto Soccorso (triage, accesso, dimissione PS)
- referto_radiologico: Referto di esami radiologici (RX, TAC, RM, ecografia)
- referto_laboratorio: Esami del sangue, urine, markers tumorali, etc.
- certificato_medico: Certificato medico generico o specialistico
- perizia_ctu: Perizia di Consulente Tecnico d'Ufficio (nominato dal giudice)
- perizia_ctp: Perizia di Consulente Tecnico di Parte
- verbale_commissione: Verbale commissione invalidità (INPS, ASL)
- lettera_dimissione: Lettera di dimissione ospedaliera (SDO, lettera fine ricovero)
- referto_specialistico: Referto visita specialistica (ortopedico, neurologico, etc.)
- denuncia_infortunio: Denuncia di infortunio sul lavoro (INAIL)
- polizza_assicurativa: Documentazione assicurativa
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
  referto_pronto_soccorso: [
    /pronto soccorso/i,
    /verbale.*ps/i,
    /triage/i,
    /codice\s*(rosso|giallo|verde|bianco)/i,
    /accesso\s*ps/i,
    /dimissione.*ps/i
  ],
  cartella_clinica: [
    /cartella clinica/i,
    /diario clinico/i,
    /anamnesi/i,
    /esame obiettivo/i,
    /diario infermieristico/i
  ],
  referto_radiologico: [
    /referto\s*radiologico/i,
    /rx\s|tac\s|rm\s|rmn\s/i,
    /risonanza magnetica/i,
    /tomografia/i,
    /ecografia/i,
    /esame radiografico/i
  ],
  referto_laboratorio: [
    /esami\s*di\s*laboratorio/i,
    /emocromo/i,
    /glicemia/i,
    /creatinina/i,
    /transaminasi/i,
    /esame\s*urine/i,
    /valori\s*ematici/i
  ],
  lettera_dimissione: [
    /lettera\s*di\s*dimissione/i,
    /dimissione\s*ospedaliera/i,
    /si\s*dimette/i,
    /sdo/i,
    /scheda\s*di\s*dimissione/i
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
  verbale_commissione: [
    /commissione\s*(medica|invalidità)/i,
    /accertamento\s*invalidità/i,
    /inps/i,
    /handicap/i,
    /legge\s*104/i
  ],
  certificato_medico: [
    /si\s*certifica/i,
    /certifico/i,
    /certificato\s*medico/i,
    /il\s*sottoscritto\s*medico/i
  ],
  denuncia_infortunio: [
    /denuncia\s*infortunio/i,
    /inail/i,
    /infortunio\s*sul\s*lavoro/i,
    /causa\s*di\s*servizio/i
  ],
  polizza_assicurativa: [
    /polizza/i,
    /assicurazione/i,
    /massimale/i,
    /franchigia/i,
    /sinistro/i
  ],
  referto_specialistico: [
    /visita\s*(ortopedica|neurologica|cardiologica|fisiatrica)/i,
    /esame\s*specialistico/i,
    /consulenza\s*specialistica/i
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
        model: 'gpt-4o-mini', // Modello veloce ed economico
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
