-- Migrazione per aggiungere stili di formattazione alle categorie di template
-- Gli stili vengono estratti automaticamente dai template Word caricati

-- Aggiungi colonna per gli stili di formattazione
ALTER TABLE template_categories 
ADD COLUMN IF NOT EXISTS formatting_styles JSONB DEFAULT '{}';

-- Commento per documentazione
COMMENT ON COLUMN template_categories.formatting_styles IS 
  'Stili di formattazione estratti dai template Word (font, margini, spaziature, colori). Usati per esportare documenti con la stessa impaginazione.';

-- Esempio struttura JSONB:
-- {
--   "fontFamily": "Times New Roman",
--   "fontFamilyHeading": "Arial",
--   "fontSizeBody": 12,
--   "fontSizeHeading1": 16,
--   "fontSizeHeading2": 14,
--   "marginTop": 25,
--   "marginBottom": 25,
--   "marginLeft": 25,
--   "marginRight": 25,
--   "lineSpacing": 1.15,
--   "paragraphSpacingAfter": 8,
--   "colorPrimary": "000000",
--   "alignment": "justify",
--   "extractedFrom": "perizia_esempio.docx",
--   "extractedAt": "2025-01-31T10:00:00Z"
-- }
