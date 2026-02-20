-- Migrazione per aggiungere supporto alla ricerca vettoriale per i document templates
-- Usa pgvector per trovare i template più rilevanti semanticamente

-- Abilita l'estensione pgvector (se non già abilitata)
CREATE EXTENSION IF NOT EXISTS vector;

-- Aggiungi colonna vector alla tabella document_templates
-- Gli embeddings OpenAI hanno 1536 dimensioni
ALTER TABLE document_templates 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Crea indice HNSW per ricerca vettoriale efficiente
-- HNSW è più veloce di IVFFlat per ricerche simili
CREATE INDEX IF NOT EXISTS idx_document_templates_embedding 
ON document_templates 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Funzione per ricerca semantica dei template
-- Trova i template più simili a un embedding di query
CREATE OR REPLACE FUNCTION search_similar_templates(
  query_embedding vector(1536),
  category_id_filter UUID DEFAULT NULL,
  user_id_filter UUID DEFAULT NULL,
  limit_count INTEGER DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id UUID,
  file_name VARCHAR(500),
  original_content TEXT,
  style_analysis TEXT,
  metadata JSONB,
  similarity FLOAT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.id,
    dt.user_id,
    dt.category_id,
    dt.file_name,
    dt.original_content,
    dt.style_analysis,
    dt.metadata,
    1 - (dt.embedding <=> query_embedding) AS similarity, -- cosine distance -> similarity
    dt.created_at
  FROM document_templates dt
  WHERE 
    dt.embedding IS NOT NULL
    AND (category_id_filter IS NULL OR dt.category_id = category_id_filter)
    AND (user_id_filter IS NULL OR dt.user_id = user_id_filter)
    AND (1 - (dt.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY dt.embedding <=> query_embedding -- cosine distance (minore = più simile)
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commenti per documentazione
COMMENT ON COLUMN document_templates.embedding IS 'Embedding vettoriale del contenuto del template generato con OpenAI text-embedding-3-small (1536 dimensioni)';
COMMENT ON FUNCTION search_similar_templates IS 'Trova i template più simili semanticamente a un embedding di query. Restituisce i top N template ordinati per similarità.';
