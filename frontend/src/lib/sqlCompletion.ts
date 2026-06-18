// Shared SQL IntelliSense for the SQL editor and the chart editor.
// Inline ghost-text prediction (primary) + a full list on Ctrl+Space.

export const SQL_KEYWORDS = [
  "SELECT", "DISTINCT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL JOIN", "ON", "AS", "AND", "OR", "NOT",
  "IN", "IS", "NULL", "LIKE", "BETWEEN", "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC",
  "UNION", "UNION ALL", "WITH", "COUNT(*)", "SUM", "AVG", "MIN", "MAX", "ROUND", "COALESCE",
  "CAST", "DATE_TRUNC", "EXTRACT",
];

// A shared catalog the completion provider reads from. Pages keep it up to date
// as dataset schemas load; the provider is registered exactly once per Monaco.
export const sqlCatalog: { tables: { qualified: string; columns: string[] }[] } = { tables: [] };
let sqlProviderRegistered = false;

function sqlCandidates(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of sqlCatalog.tables) {
    out.push(t.qualified);
    for (const c of t.columns) if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  out.push(...SQL_KEYWORDS);
  return out;
}

export function registerSqlCompletion(monaco: any) {
  if (sqlProviderRegistered) return;
  sqlProviderRegistered = true;

  // Inline ghost-text prediction: type, see the rest greyed out, Tab to accept.
  const inlineProvider = {
    provideInlineCompletions(model: any, position: any) {
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const m = line.match(/([A-Za-z_][A-Za-z0-9_.()*]*)$/);
      if (!m) return { items: [] };
      const prefix = m[1];
      if (prefix.length < 2) return { items: [] };
      const lower = prefix.toLowerCase();
      const hit = sqlCandidates().find((c) => c.length > prefix.length && c.toLowerCase().startsWith(lower));
      if (!hit) return { items: [] };
      const range = new monaco.Range(position.lineNumber, position.column - prefix.length, position.lineNumber, position.column);
      return { items: [{ insertText: hit, range }] };
    },
    freeInlineCompletions() {},
  };

  // Full list, still available on demand via Ctrl+Space.
  const itemProvider: any = {
    triggerCharacters: [" ", ".", "("],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions: any[] = [];
      const seenCols = new Set<string>();
      for (const t of sqlCatalog.tables) {
        suggestions.push({ label: t.qualified, kind: monaco.languages.CompletionItemKind.Struct, detail: "table", insertText: t.qualified, range });
        for (const c of t.columns) {
          if (seenCols.has(c)) continue;
          seenCols.add(c);
          suggestions.push({ label: c, kind: monaco.languages.CompletionItemKind.Field, detail: "column", insertText: c, range });
        }
      }
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({ label: kw, kind: monaco.languages.CompletionItemKind.Keyword, insertText: kw, range });
      }
      return { suggestions };
    },
  };

  // Register for both the generic SQL and Postgres (pgsql) languages.
  for (const lang of ["sql", "pgsql"]) {
    monaco.languages.registerInlineCompletionsProvider(lang, inlineProvider);
    monaco.languages.registerCompletionItemProvider(lang, itemProvider);
  }
}
