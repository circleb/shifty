import schemaSql from "../schema.sql";

let ready: Promise<void> | undefined;

/** D1's exec rejects files that start with a comment, so run each statement on its own. */
function statements(sql: string): string[] {
  const withoutLineComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutLineComments
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/** Creates the tables if this database does not have them yet. Safe to call on every request. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = db.batch(statements(schemaSql).map((sql) => db.prepare(sql))).then(
      () => undefined,
      (err: unknown) => {
        ready = undefined;
        throw err;
      },
    );
  }
  return ready;
}
