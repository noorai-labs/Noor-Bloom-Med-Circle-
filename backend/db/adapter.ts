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

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new Error(
      "D1 does not support interactive transactions; use batch() for atomic statement groups.",
    );
  }
}

/**
 * Interface representing a standard PostgreSQL client (e.g. pg, neon, or a local pool).
 */
export interface PgClientLike {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

/**
 * PostgreSQL Database Adapter
 * Implements parameter mapping ($1, $2), JSONB conversion, and ACID transactions.
 */
export class PostgresAdapter implements DatabaseAdapter {
  constructor(private client: PgClientLike) {}

  /**
   * Translates SQLite '?' positional placeholders into PostgreSQL '$1, $2, ...' numbered placeholders.
   */
  public static translateQuery(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
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
    return await this.transaction(async (tx) => {
      const results: QueryResult[] = [];
      for (const stmt of statements) {
        const res = await tx.execute(stmt.sql, stmt.params || []);
        results.push(res);
      }
      return results;
    });
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    await this.client.query("BEGIN");
    try {
      const result = await fn(this);
      await this.client.query("COMMIT");
      return result;
    } catch (err) {
      await this.client.query("ROLLBACK");
      throw err;
    }
  }
}
