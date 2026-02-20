-- Migrazione per aggiungere prompt personalizzato alle categorie di template
-- Il prompt viene generato automaticamente analizzando i template caricati

-- Aggiungi colonne per il prompt personalizzato
ALTER TABLE template_categories 
ADD COLUMN IF NOT EXISTS custom_prompt TEXT,
ADD COLUMN IF NOT EXISTS prompt_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS prompt_version INTEGER DEFAULT 1;

-- Commenti per documentazione
COMMENT ON COLUMN template_categories.custom_prompt IS 
  'Prompt personalizzato generato dall''AI analizzando i template della categoria. Viene rigenerato ad ogni nuovo template caricato.';

COMMENT ON COLUMN template_categories.prompt_generated_at IS 
  'Timestamp dell''ultima generazione del prompt personalizzato';

COMMENT ON COLUMN template_categories.prompt_version IS 
  'Versione del prompt, incrementata ad ogni rigenerazione';
