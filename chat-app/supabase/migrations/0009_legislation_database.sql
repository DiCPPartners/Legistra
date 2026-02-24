-- Database locale della legislazione italiana
-- Contiene tutti gli articoli dei Codici principali con ricerca full-text istantanea

CREATE TABLE IF NOT EXISTS legislation_codes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  urn TEXT,
  normattiva_url TEXT,
  description TEXT,
  articles_count INTEGER DEFAULT 0,
  last_imported TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legislation_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id TEXT NOT NULL REFERENCES legislation_codes(id) ON DELETE CASCADE,
  article_number TEXT NOT NULL,
  article_title TEXT,
  book TEXT,
  title TEXT,
  chapter TEXT,
  section TEXT,
  article_text TEXT NOT NULL,
  normattiva_url TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code_id, article_number)
);

CREATE INDEX idx_legislation_articles_code_id ON legislation_articles(code_id);
CREATE INDEX idx_legislation_articles_number ON legislation_articles(article_number);
CREATE INDEX idx_legislation_articles_search ON legislation_articles USING GIN(search_vector);

CREATE OR REPLACE FUNCTION legislation_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('italian', COALESCE(NEW.article_number, '')), 'A') ||
    setweight(to_tsvector('italian', COALESCE(NEW.article_title, '')), 'A') ||
    setweight(to_tsvector('italian', COALESCE(NEW.book, '')), 'C') ||
    setweight(to_tsvector('italian', COALESCE(NEW.title, '')), 'B') ||
    setweight(to_tsvector('italian', COALESCE(NEW.chapter, '')), 'C') ||
    setweight(to_tsvector('italian', COALESCE(NEW.article_text, '')), 'D');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_legislation_search_vector
  BEFORE INSERT OR UPDATE ON legislation_articles
  FOR EACH ROW EXECUTE FUNCTION legislation_search_vector_update();

CREATE OR REPLACE FUNCTION search_legislation(
  query_text TEXT,
  code_filter TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 20,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  code_id TEXT,
  code_name TEXT,
  article_number TEXT,
  article_title TEXT,
  book TEXT,
  title TEXT,
  article_text TEXT,
  normattiva_url TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    la.id,
    la.code_id,
    lc.name AS code_name,
    la.article_number,
    la.article_title,
    la.book,
    la.title,
    la.article_text,
    la.normattiva_url,
    ts_rank_cd(la.search_vector, websearch_to_tsquery('italian', query_text)) AS rank
  FROM legislation_articles la
  JOIN legislation_codes lc ON lc.id = la.code_id
  WHERE 
    la.search_vector @@ websearch_to_tsquery('italian', query_text)
    AND (code_filter IS NULL OR la.code_id = code_filter)
  ORDER BY rank DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE legislation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE legislation_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read legislation codes" ON legislation_codes FOR SELECT USING (true);
CREATE POLICY "Anyone can read legislation articles" ON legislation_articles FOR SELECT USING (true);

INSERT INTO legislation_codes (id, name, full_name, urn, description) VALUES
  ('cc', 'Codice Civile', 'Regio Decreto 16 marzo 1942, n. 262', 'urn:nir:stato:regio.decreto:1942-03-16;262', 'Codice Civile italiano'),
  ('cp', 'Codice Penale', 'Regio Decreto 19 ottobre 1930, n. 1398', 'urn:nir:stato:regio.decreto:1930-10-19;1398', 'Codice Penale italiano'),
  ('cpc', 'Codice di Procedura Civile', 'Regio Decreto 28 ottobre 1940, n. 1443', 'urn:nir:stato:regio.decreto:1940-10-28;1443', 'Codice di Procedura Civile italiano'),
  ('cpp', 'Codice di Procedura Penale', 'D.P.R. 22 settembre 1988, n. 447', 'urn:nir:stato:decreto.del.presidente.della.repubblica:1988-09-22;447', 'Codice di Procedura Penale italiano'),
  ('cost', 'Costituzione', 'Costituzione della Repubblica Italiana', 'urn:nir:stato:costituzione:1947-12-27', 'Costituzione della Repubblica Italiana')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE legislation_codes IS 'Codici e leggi importate nel database locale';
COMMENT ON TABLE legislation_articles IS 'Singoli articoli di legge con ricerca full-text in italiano';
COMMENT ON FUNCTION search_legislation IS 'Ricerca full-text negli articoli di legge con ranking per rilevanza';
