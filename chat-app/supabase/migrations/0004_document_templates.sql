-- Migrazione per creare le tabelle per i Document Templates
-- I template sono documenti caricati dall'utente che servono come esempi di stile

-- Tabella per le categorie di documenti
CREATE TABLE IF NOT EXISTS template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'document',
  color VARCHAR(20) DEFAULT '#8C2B42',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Tabella per i documenti template
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT DEFAULT 0,
  original_content TEXT, -- Contenuto trascritto del documento
  style_analysis TEXT, -- Analisi dello stile estratta dal documento
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_template_categories_user_id ON template_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_user_id ON document_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_category_id ON document_templates(category_id);

-- RLS (Row Level Security)
ALTER TABLE template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

-- Policy per template_categories
CREATE POLICY "Users can view their own template categories"
  ON template_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own template categories"
  ON template_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own template categories"
  ON template_categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own template categories"
  ON template_categories FOR DELETE
  USING (auth.uid() = user_id);

-- Policy per document_templates
CREATE POLICY "Users can view their own document templates"
  ON document_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document templates"
  ON document_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own document templates"
  ON document_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own document templates"
  ON document_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger per aggiornare updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_template_categories_updated_at
  BEFORE UPDATE ON template_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Categorie predefinite (opzionale - verranno create per ogni utente)
-- Nota: queste vanno inserite quando l'utente si registra o accede per la prima volta
