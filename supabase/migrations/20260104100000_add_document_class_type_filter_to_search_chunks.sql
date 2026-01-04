-- Add document-class and document-type filters to search_chunks
-- =============================================================================
-- This migration updates the search_chunks function to support filtering by
-- document-class and document-type frontmatter fields
-- =============================================================================

-- Drop existing function
DROP FUNCTION IF EXISTS search_chunks(vector(512), text[], int, float);

-- Recreate with new filter parameters
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(512),
    filter_tags text[] DEFAULT NULL,
    match_count int DEFAULT 5,
    similarity_threshold float DEFAULT 0.7,
    filter_document_class text DEFAULT NULL,
    filter_document_type text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title text,
    heading text,
    content text,
    file_path text,
    similarity float,
    document_class text,
    document_type text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        d.frontmatter->>'title' AS title,
        c.heading,
        c.content,
        d.file_path,
        1 - (c.embedding <=> query_embedding) AS similarity,
        d.frontmatter->>'document-class' AS document_class,
        d.frontmatter->>'document-type' AS document_type
    FROM rag.chunks c
    JOIN raw.github_contents__documents d ON c.document_id = d.id
    WHERE
        (filter_tags IS NULL OR d.frontmatter->'tags' ?| filter_tags)
        AND (filter_document_class IS NULL OR d.frontmatter->>'document-class' = filter_document_class)
        AND (filter_document_type IS NULL OR d.frontmatter->>'document-type' = filter_document_type)
        AND 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_chunks IS 'Vector similarity search with optional tag, document-class, and document-type filtering';

-- Add indexes for document-class and document-type
CREATE INDEX IF NOT EXISTS github_contents__documents_document_class_idx
    ON raw.github_contents__documents ((frontmatter->>'document-class'));

CREATE INDEX IF NOT EXISTS github_contents__documents_document_type_idx
    ON raw.github_contents__documents ((frontmatter->>'document-type'));
