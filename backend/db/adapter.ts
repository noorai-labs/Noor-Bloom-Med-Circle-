import type { DatabaseAdapter, QueryResult, Statement } from "./types";

/**
 * Cloudflare D1 Database Adapter
 * Implements the DatabaseAdapter contract over Cloudflare D1.
 */
export class D1Adapter implements DatabaseAdapter {
  constructor(private db: D1Database) {}

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.all<T>();
    return result.results;
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql).bind(...params);
    return await stmt.first<T>();
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.run();
    return {
      rows: [],
      changes: result.meta?.changes ?? 0,
    };
  }

  async batch(statements: Statement[]): Promise<QueryResult[]> {
    const prepared = statements.map((s) =>
      this.db.prepare(s.sql).bind(...(s.params || [])),
    );
    const results = await this.db.batch(prepared);
    return results.map((r) => ({
      rows: (r.results as unknown[]) || [],
      changes: r.meta?.changes ?? 0,
    }));
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new Error(
      "D1 does not support interactive transactions; use batch() for atomic statement groups.",
    );
  }
}

/**
 * PostgreSQL query interface shared by a pool and its leased connections.
 */
export interface PgClientLike {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null; command?: string }>;
}

export interface PgConnectionLike extends PgClientLike {
  release(destroy?: boolean): void;
}

export interface PgPoolLike extends PgClientLike {
  connect(): Promise<PgConnectionLike>;
}

/**
 * PostgreSQL Database Adapter
 * Implements parameter mapping ($1, $2), JSONB conversion, and ACID transactions.
 */
export class PostgresAdapter implements DatabaseAdapter {
  private connection?: PgConnectionLike;
  private closed = false;

  constructor(private pool: PgPoolLike) {}

  private get client(): PgClientLike {
    if (this.closed) throw new Error("The PostgreSQL transaction has ended.");
    return this.connection ?? this.pool;
  }

  /**
   * Translates SQLite '?' positional placeholders into PostgreSQL '$1, $2, ...' numbered placeholders.
   */
  public static translateQuery(sql: string): string {
    // Skip whole identifiers so an embedded dollar sign cannot start a dollar quote.
    const tokens = /--|\/\*|[eE]'|['"`]|\$(?:[a-z_\u0080-\uffff][\w\u0080-\uffff]*)?\$|[a-z_\u0080-\uffff][\w$\u0080-\uffff]*|\?/gi;
    let index = 1;
    let copied = 0;
    let translated = "";

    for (let match; (match = tokens.exec(sql));) {
      const token = match[0];
      let end = tokens.lastIndex;
      if (token === "?") {
        translated += sql.slice(copied, match.index) + `$${index++}`;
        copied = end;
      } else if (token === "--") {
        while (end < sql.length && sql[end] !== "\n" && sql[end] !== "\r") end++;
      } else if (token === "/*") {
        let depth = 1;
        while (end < sql.length && depth > 0) {
          if (sql.startsWith("/*", end)) {
            depth++;
            end += 2;
          } else if (sql.startsWith("*/", end)) {
            depth--;
            end += 2;
          } else {
            end++;
          }
        }
      } else if (token.startsWith("$")) {
        const closing = sql.indexOf(token, end);
        end = closing < 0 ? sql.length : closing + token.length;
      } else if (token.endsWith("'") || token === '"' || token === "`") {
        const quote = token[token.length - 1];
        while (end < sql.length) {
          const char = sql[end++];
          if (token.length === 2 && char === "\\") {
            end++;
          } else if (char === quote) {
            if (sql[end] !== quote) break;
            end++;
          }
        }
      }
      tokens.lastIndex = end;
    }
    return translated + sql.slice(copied);
  }

  /**
   * Sanitizes parameters for PostgreSQL compatibility (e.g. objects stringified for JSONB).
   */
  public static sanitizeParams(params: unknown[] = []): unknown[] {
    return params.map((p) => {
      if (p !== null && typeof p === "object" && !(p instanceof Date)) {
        return JSON.stringify(p);
      }
      return p;
    });
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const translated = PostgresAdapter.translateQuery(sql);
    const cleanParams = PostgresAdapter.sanitizeParams(params);
    const res = await this.client.query<T>(translated, cleanParams);
    return res.rows;
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const translated = PostgresAdapter.translateQuery(sql);
    const cleanParams = PostgresAdapter.sanitizeParams(params);
    const res = await this.client.query(translated, cleanParams);
    return {
      rows: res.rows,
      changes: res.rowCount ?? 0,
    };
  }

  async batch(statements: Statement[]): Promise<QueryResult[]> {
    if (!this.connection) return this.transaction((tx) => tx.batch(statements));

    // Use the enclosing transaction. Its caller owns commit and rollback.
    if (this.closed) throw new Error("The PostgreSQL transaction has ended.");
    const results: QueryResult[] = [];
    for (const stmt of statements) {
      results.push(await this.execute(stmt.sql, stmt.params));
    }
    return results;
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    if (this.connection) throw new Error("Nested PostgreSQL transactions are not supported.");

    const connection = await this.pool.connect();
    const tx = new PostgresAdapter(this.pool);
    tx.connection = connection;

    // Discard the connection if BEGIN or the rollback fails.
    let destroy = true;
    try {
      await connection.query("BEGIN");
      let result: T;
      let commit;
      try {
        try {
          result = await fn(tx);
        } finally {
          tx.closed = true;
        }
        commit = await connection.query("COMMIT");
      } catch (error) {
        try {
          await connection.query("ROLLBACK");
          destroy = false;
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "PostgreSQL transaction and rollback both failed.");
        }
        throw error;
      }
      destroy = false;
      if (commit.command === "ROLLBACK") {
        throw new Error("PostgreSQL rolled back the transaction instead of committing.");
      }
      return result;
    } finally {
      connection.release(destroy);
    }
  }
}
