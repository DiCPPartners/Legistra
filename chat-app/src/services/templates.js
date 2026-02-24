import { supabase } from './supabaseClient'
import { generateCategoryPrompt } from './openai'

// Categorie personalizzate predefinite create automaticamente per nuovi utenti
export const PRESET_CUSTOM_CATEGORIES = [
  {
    name: 'RC Auto',
    description: 'Perizie e analisi per sinistri stradali e responsabilità civile auto',
    icon: 'scale',
    color: '#3b82f6',
  },
  {
    name: 'Polizza Infortuni',
    description: 'Valutazioni per polizze infortuni e coperture assicurative',
    icon: 'certificate',
    color: '#10b981',
  },
  {
    name: 'Malpractice',
    description: 'Analisi responsabilità professionale e deviazioni dagli standard di cura',
    icon: 'certificate',
    color: '#ef4444',
  },
  {
    name: 'Invalidità Civile',
    description: 'Valutazioni per invalidità civile e calcolo percentuali',
    icon: 'user',
    color: '#8b5cf6',
  },
  {
    name: 'INAIL',
    description: 'Perizie per infortuni sul lavoro e malattie professionali',
    icon: 'document',
    color: '#f59e0b',
  },
]

// Manteniamo per retrocompatibilità (vuoto - non più usato per filtering)
export const DEFAULT_CATEGORIES = []

// Ottieni tutte le categorie dell'utente
export async function fetchCategories() {
  const { data, error } = await supabase
    .from('template_categories')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Crea una nuova categoria
export async function createCategory({ name, description, icon, color }) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user?.id) throw new Error('Utente non autenticato')

  const { data, error } = await supabase
    .from('template_categories')
    .insert({
      user_id: userData.user.id,
      name,
      description: description || '',
      icon: icon || 'document',
      color: color || '#8C2B42',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Aggiorna una categoria
export async function updateCategory(categoryId, { name, description, icon, color }) {
  const { data, error } = await supabase
    .from('template_categories')
    .update({
      name,
      description,
      icon,
      color,
    })
    .eq('id', categoryId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Elimina una categoria
export async function deleteCategory(categoryId) {
  const { error } = await supabase
    .from('template_categories')
    .delete()
    .eq('id', categoryId)

  if (error) throw error
}

// Ottieni tutti i template di una categoria
export async function fetchTemplatesByCategory(categoryId) {
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('category_id', categoryId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// Ottieni tutti i template dell'utente
export async function fetchAllTemplates() {
  const { data, error } = await supabase
    .from('document_templates')
    .select(`
      *,
      template_categories (
        id,
        name,
        icon,
        color
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// Crea un nuovo template
export async function createTemplate({ categoryId, categoryName, fileName, fileSize, originalContent, styleAnalysis, metadata, apiKey }) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user?.id) throw new Error('Utente non autenticato')

  const { data, error } = await supabase
    .from('document_templates')
    .insert({
      user_id: userData.user.id,
      category_id: categoryId,
      file_name: fileName,
      file_size: fileSize || 0,
      original_content: originalContent || '',
      style_analysis: styleAnalysis || '',
      metadata: metadata || {},
    })
    .select()
    .single()

  if (error) throw error
  
  // Genera e salva embedding se abbiamo apiKey e contenuto
  if (apiKey && originalContent && originalContent.trim()) {
    try {
      await generateAndSaveEmbedding({ 
        templateId: data.id, 
        apiKey, 
        text: originalContent 
      })
    } catch (embeddingError) {
      console.warn('Errore nella generazione embedding (non bloccante):', embeddingError)
      // Non blocchiamo la creazione del template se l'embedding fallisce
    }
  }
  
  // Rigenera il prompt personalizzato della categoria dopo ogni nuovo template
  // Questo viene fatto in background per non rallentare l'upload
  if (apiKey) {
    // Recupera il nome della categoria se non fornito
    let catName = categoryName
    if (!catName) {
      try {
        const { data: catData } = await supabase
          .from('template_categories')
          .select('name')
          .eq('id', categoryId)
          .single()
        catName = catData?.name
      } catch (e) {
        console.warn('Impossibile recuperare nome categoria:', e)
      }
    }
    
    if (catName) {
      // Esegui in background senza bloccare
      regenerateCategoryPrompt({ 
        categoryId, 
        categoryName: catName, 
        apiKey 
      }).catch(err => {
        console.warn('Errore rigenerazione prompt categoria (non bloccante):', err.message)
      })
    }
  }
  
  return data
}

// Aggiorna un template
export async function updateTemplate(templateId, { originalContent, styleAnalysis, metadata }) {
  const updates = {}
  if (originalContent !== undefined) updates.original_content = originalContent
  if (styleAnalysis !== undefined) updates.style_analysis = styleAnalysis
  if (metadata !== undefined) updates.metadata = metadata

  const { data, error } = await supabase
    .from('document_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Elimina un template
export async function deleteTemplate(templateId) {
  const { error } = await supabase
    .from('document_templates')
    .delete()
    .eq('id', templateId)

  if (error) throw error
}

// ===== FUNZIONI PER PROMPT PERSONALIZZATO CATEGORIA =====

/**
 * Aggiorna il prompt personalizzato di una categoria
 * @param {string} categoryId - ID della categoria
 * @param {string} customPrompt - Il prompt generato
 * @returns {Promise<Object>} La categoria aggiornata
 */
export async function updateCategoryPrompt(categoryId, customPrompt) {
  const { data, error } = await supabase
    .from('template_categories')
    .update({
      custom_prompt: customPrompt,
      prompt_generated_at: new Date().toISOString(),
      prompt_version: supabase.sql`COALESCE(prompt_version, 0) + 1`
    })
    .eq('id', categoryId)
    .select()
    .single()

  if (error) {
    // Fallback senza increment SQL se non supportato
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('template_categories')
      .update({
        custom_prompt: customPrompt,
        prompt_generated_at: new Date().toISOString()
      })
      .eq('id', categoryId)
      .select()
      .single()
    
    if (fallbackError) throw fallbackError
    return fallbackData
  }
  
  return data
}

/**
 * Aggiorna gli stili di formattazione di una categoria
 * Gli stili vengono estratti dai template Word e usati per l'esportazione
 * 
 * @param {string} categoryId - ID della categoria
 * @param {Object} formattingStyles - Oggetto con gli stili estratti
 * @returns {Promise<Object>} La categoria aggiornata
 */
export async function updateCategoryFormattingStyles(categoryId, formattingStyles) {
  const { data, error } = await supabase
    .from('template_categories')
    .update({
      formatting_styles: formattingStyles
    })
    .eq('id', categoryId)
    .select()
    .single()

  if (error) throw error
  
  console.log(`📐 Stili formattazione aggiornati per categoria ${categoryId}`)
  return data
}

/**
 * Recupera gli stili di formattazione di una categoria
 * @param {string} categoryId - ID della categoria
 * @returns {Promise<Object|null>} Gli stili o null se non presenti
 */
export async function getCategoryFormattingStyles(categoryId) {
  const { data, error } = await supabase
    .from('template_categories')
    .select('formatting_styles')
    .eq('id', categoryId)
    .single()

  if (error) {
    console.warn('Errore recupero stili formattazione:', error)
    return null
  }
  
  return data?.formatting_styles || null
}

/**
 * Rigenera il prompt personalizzato di una categoria analizzando tutti i suoi template
 * Viene chiamato ogni volta che viene caricato un nuovo template
 * 
 * @param {string} categoryId - ID della categoria
 * @param {string} categoryName - Nome della categoria
 * @param {string} apiKey - API key OpenAI
 * @returns {Promise<string>} Il nuovo prompt generato
 */
export async function regenerateCategoryPrompt({ categoryId, categoryName, apiKey }) {
  if (!apiKey) {
    console.warn('API key mancante, impossibile generare prompt categoria')
    return null
  }

  try {
    // Recupera tutti i template della categoria
    const templates = await fetchTemplatesByCategory(categoryId)
    
    if (!templates || templates.length === 0) {
      console.warn('Nessun template trovato per la categoria, impossibile generare prompt')
      return null
    }

    console.log(`🔄 Rigenerazione prompt per categoria "${categoryName}" (${templates.length} template)...`)

    // Genera il nuovo prompt
    const newPrompt = await generateCategoryPrompt({
      categoryName,
      templates,
      apiKey
    })

    // Salva il prompt nel database
    await updateCategoryPrompt(categoryId, newPrompt)

    console.log(`✅ Prompt categoria "${categoryName}" aggiornato (${newPrompt.length} caratteri)`)
    return newPrompt

  } catch (error) {
    console.error('Errore nella rigenerazione del prompt categoria:', error)
    // Non blocchiamo l'operazione principale se la generazione del prompt fallisce
    return null
  }
}

/**
 * Recupera una categoria con il suo prompt personalizzato
 * @param {string} categoryId - ID della categoria
 * @returns {Promise<Object>} La categoria con custom_prompt
 */
export async function getCategoryWithPrompt(categoryId) {
  const { data, error } = await supabase
    .from('template_categories')
    .select('id, name, description, icon, color, custom_prompt, prompt_generated_at, prompt_version')
    .eq('id', categoryId)
    .single()

  if (error) throw error
  return data
}

// Inizializza le categorie predefinite per un nuovo utente
// Crea le 5 categorie personalizzate predefinite se l'utente non ne ha nessuna
export async function initializeDefaultCategories() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user?.id) throw new Error('Utente non autenticato')

  // Controlla se l'utente ha già delle categorie
  const existing = await fetchCategories()
  
  // Se l'utente ha già categorie, restituiscile
  if (existing && existing.length > 0) {
    return existing
  }

  // Crea le categorie predefinite per il nuovo utente
  console.log('🆕 Creazione categorie predefinite per nuovo utente...')
  const createdCategories = []
  
  for (const category of PRESET_CUSTOM_CATEGORIES) {
    try {
      const created = await createCategory({
        name: category.name,
        description: category.description,
        icon: category.icon,
        color: category.color,
      })
      createdCategories.push(created)
      console.log(`✅ Categoria "${category.name}" creata`)
    } catch (error) {
      // Ignora errori di duplicati (potrebbe già esistere)
      if (!error.message?.includes('duplicate')) {
        console.warn(`⚠️ Errore creazione categoria "${category.name}":`, error.message)
      }
    }
  }

  console.log(`📁 Create ${createdCategories.length} categorie predefinite`)
  return createdCategories.length > 0 ? createdCategories : existing
}

// Ottieni i template per una categoria specifica (per la generazione)
// Supporta sia ricerca per nome categoria (legacy) che per ID categoria con ricerca vettoriale
// Restituisce { templates, customPrompt } per supportare prompt personalizzati
export async function getTemplatesForGeneration(categoryNameOrId, options = {}) {
  const { caseData, apiKey, limit = 5, useVectorSearch = true } = options
  
  // Se abbiamo categoryId (UUID), categoryNameOrId è un ID
  const isCategoryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryNameOrId)
  
  // Recupera il custom_prompt della categoria se abbiamo un categoryId
  let customPrompt = null
  if (isCategoryId) {
    try {
      const category = await getCategoryWithPrompt(categoryNameOrId)
      customPrompt = category?.custom_prompt || null
    } catch (e) {
      console.warn('Impossibile recuperare custom_prompt:', e)
    }
  }
  
  if (isCategoryId && useVectorSearch && caseData && apiKey) {
    // Usa ricerca vettoriale se abbiamo tutti i parametri necessari
    try {
      const templates = await getTemplatesForGenerationWithVectorSearch({
        categoryId: categoryNameOrId,
        caseData,
        apiKey,
        limit,
      })
      return { templates, customPrompt }
    } catch (error) {
      console.warn('Errore nella ricerca vettoriale, fallback al metodo tradizionale:', error)
    }
  }
  
  // Fallback: ricerca tradizionale per nome categoria o ID categoria
  const query = supabase
    .from('document_templates')
    .select(`
      id,
      original_content,
      style_analysis,
      template_categories!inner (
        id,
        name,
        custom_prompt
      )
    `)
  
  if (isCategoryId) {
    query.eq('category_id', categoryNameOrId)
  } else {
    query.ilike('template_categories.name', `%${categoryNameOrId}%`)
  }
  
  if (limit) {
    query.limit(limit)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  
  // Estrai customPrompt dal primo template se non già recuperato
  if (!customPrompt && data && data.length > 0) {
    customPrompt = data[0]?.template_categories?.custom_prompt || null
  }
  
  return { templates: data ?? [], customPrompt }
}

// Ottieni tutte le categorie personalizzate dell'utente
export async function fetchCustomCategories() {
  const { data, error } = await supabase
    .from('template_categories')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  
  // Tutte le categorie sono ora personalizzate
  return data ?? []
}

// Conta i template per ogni categoria
export async function countTemplatesByCategory() {
  const { data, error } = await supabase
    .from('document_templates')
    .select('category_id')

  if (error) throw error

  const counts = {}
  data?.forEach(template => {
    counts[template.category_id] = (counts[template.category_id] || 0) + 1
  })

  return counts
}

// ===== FUNZIONI PER RICERCA VETTORIALE =====

/**
 * Genera e salva l'embedding per un template
 * @param {string} templateId - ID del template
 * @param {string} apiKey - Chiave API OpenAI
 * @param {string} text - Testo del template da convertire in embedding
 */
export async function generateAndSaveEmbedding({ templateId, apiKey, text }) {
  if (!text || !text.trim()) {
    console.warn('Nessun testo fornito per generare embedding, salto questo template')
    return
  }

  try {
    // Importa la funzione generateEmbedding dinamicamente per evitare dipendenze circolari
    const { generateEmbedding } = await import('./embeddings.js')
    const embedding = await generateEmbedding(text, apiKey)

    // Salva l'embedding nel database
    const { error } = await supabase
      .from('document_templates')
      .update({ embedding })
      .eq('id', templateId)

    if (error) {
      console.error('Errore nel salvataggio dell\'embedding:', error)
      throw error
    }
  } catch (error) {
    console.error('Errore nella generazione dell\'embedding:', error)
    throw error
  }
}

/**
 * Cerca i template più simili semanticamente usando ricerca vettoriale
 * @param {number[]} queryEmbedding - Embedding vettoriale della query (1536 dimensioni)
 * @param {string} categoryId - ID della categoria (opzionale)
 * @param {number} limit - Numero massimo di risultati (default: 5)
 * @param {number} similarityThreshold - Soglia di similarità minima (default: 0.7)
 * @returns {Promise<Array>} Array di template ordinati per similarità
 */
export async function searchSimilarTemplates({ queryEmbedding, categoryId = null, limit = 5, similarityThreshold = 0.7 }) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user?.id) throw new Error('Utente non autenticato')

  // Chiama la funzione SQL per ricerca vettoriale
  const { data, error } = await supabase.rpc('search_similar_templates', {
    query_embedding: queryEmbedding,
    category_id_filter: categoryId,
    user_id_filter: userData.user.id,
    limit_count: limit,
    similarity_threshold: similarityThreshold,
  })

  if (error) {
    console.error('Errore nella ricerca vettoriale:', error)
    throw error
  }

  return data ?? []
}

/**
 * Ottieni i template per una categoria usando ricerca vettoriale se disponibile
 * @param {string} categoryId - ID della categoria
 * @param {string} caseData - Dati del caso corrente (per ricerca semantica)
 * @param {string} apiKey - Chiave API OpenAI (per generare embedding della query)
 * @param {number} limit - Numero massimo di template da recuperare (default: 5)
 * @returns {Promise<Array>} Array di template più rilevanti
 */
export async function getTemplatesForGenerationWithVectorSearch({ categoryId, caseData, apiKey, limit = 5 }) {
  try {
    // Se abbiamo i dati del caso e la chiave API, usa ricerca vettoriale
    // Assicurati che caseData sia una stringa
    const caseDataStr = typeof caseData === 'string' ? caseData : (caseData?.toString?.() || '')
    if (caseDataStr && apiKey && caseDataStr.trim()) {
      const { generateEmbedding } = await import('./embeddings.js')
      const queryEmbedding = await generateEmbedding(caseDataStr, apiKey)
      
      const similarTemplates = await searchSimilarTemplates({
        queryEmbedding,
        categoryId,
        limit,
        similarityThreshold: 0.7, // Soglia di similarità
      })

      // Se troviamo template con ricerca vettoriale, li restituiamo
      if (similarTemplates && similarTemplates.length > 0) {
        return similarTemplates.map(t => ({
          id: t.id,
          original_content: t.original_content,
          style_analysis: t.style_analysis,
          similarity: t.similarity,
        }))
      }
    }

    // Fallback: recupera tutti i template della categoria (comportamento originale)
    const { data, error } = await supabase
      .from('document_templates')
      .select(`
        id,
        original_content,
        style_analysis,
        template_categories!inner (
          id,
          name
        )
      `)
      .eq('category_id', categoryId)
      .limit(limit)

    if (error) throw error
    return data ?? []
  } catch (error) {
    console.error('Errore nel recupero template con ricerca vettoriale:', error)
    // Fallback al metodo originale
    const { data, error: fallbackError } = await supabase
      .from('document_templates')
      .select(`
        id,
        original_content,
        style_analysis,
        template_categories!inner (
          id,
          name
        )
      `)
      .eq('category_id', categoryId)
      .limit(limit)

    if (fallbackError) throw fallbackError
    return data ?? []
  }
}
