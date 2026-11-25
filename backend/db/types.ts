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
   * Executes a batch of statements atomically.
   */
  batch(statements: Statement[]): Promise<QueryResult[]>;

  /**
   * Executes operations within an interactive ACID transaction.
   * Automatically issues BEGIN and COMMIT on success, or ROLLBACK on error.
   */
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
}
