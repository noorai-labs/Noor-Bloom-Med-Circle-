/**
 * BloomMed Database Adapter Contract
 * Decouples application logic from database engines (D1 SQLite vs PostgreSQL).
 */

export interface QueryResult<T = unknown> {
  rows: T[];
  changes: number;
}

export interface Statement {
  sql: string;
  params?: unknown[];
}

export interface DatabaseAdapter {
  /**
   * Executes a query and returns all matching rows.
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Executes a query and returns the first row, or null if empty.
   */
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Executes a mutation statement (INSERT, UPDATE, DELETE) and returns affected rowcount.
   */
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Executes a batch of statements atomically. Within a transaction callback,
   * the batch participates in the enclosing transaction without a separate
   * rollback scope; a statement failure can abort the enclosing transaction.
   */
  batch(statements: Statement[]): Promise<QueryResult[]>;

  /**
   * Executes operations within an interactive ACID transaction when supported.
   * Supported adapters commit on success and roll back on error. Adapters without
   * interactive transaction support must reject before invoking the callback.
   *
   * PostgreSQL provides a scoped adapter on one connection. Await all work
   * through that adapter before the callback returns. Nested transaction()
   * calls are unsupported.
   * On D1, use batch() for a fixed set of statements that must commit or roll
   * back together.
   */
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
}
