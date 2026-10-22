-- Exact row count of every base table in the public schema, one "table<TAB>count" line each,
-- sorted by table name. Used by the backup job (inside the dump's snapshot) and by the restore
-- drill (against the restored copy); the two outputs must be identical.
SELECT t.table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.table_schema, t.table_name),
                           false, true, '')))[1]::text::bigint AS row_count
FROM information_schema.tables AS t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
