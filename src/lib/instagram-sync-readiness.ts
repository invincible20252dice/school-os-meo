import { Prisma } from "@prisma/client";

export class InstagramSyncUnavailableError extends Error {
  constructor() { super("同期利用不可。設定を確認してから再度お試しください。"); }
}

// Only metadata is returned. Run as the same role/connection as the actual writes.
// No probing writes, credential values, legacy mapping or runtime DDL.
const columns = [
  ...["id", "schoolId", "instagramAccessToken", "instagramBusinessAccountId"].map(column =>
    ({ table: "InstagramSetting", column, types: ["text"], read: true, insert: false, update: false })),
  { table: "InstagramSetting", column: "autoSyncEnabled", types: ["bool"], read: true, insert: false, update: false },
  { table: "InstagramSetting", column: "lastSyncedAt", types: ["timestamp", "timestamptz"], read: false, insert: false, update: true },
  ...["id", "name", "gbpLocationId"].map(column =>
    ({ table: "School", column, types: ["text"], read: true, insert: false, update: false })),
  ...["id", "schoolId", "instagramMediaId", "gbpPostId", "instagramUrl", "gbpPostUrl", "caption", "formattedText"].map(column =>
    ({ table: "SyncedPost", column, types: ["text"], read: true, insert: true, update: false })),
  ...["syncedAt", "createdAt", "updatedAt"].map(column =>
    ({ table: "SyncedPost", column, types: ["timestamp", "timestamptz"], read: true, insert: true, update: false })),
];

export const instagramSyncSchemaQuery = Prisma.sql`
  WITH required AS (
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(columns)}::jsonb)
      AS r("table" text, "column" text, types text[], read boolean, insert boolean, update boolean)
  ), required_unique("table", columns) AS (
    VALUES ('School', ARRAY['id']), ('InstagramSetting', ARRAY['id']),
      ('InstagramSetting', ARRAY['schoolId']), ('SyncedPost', ARRAY['id']),
      ('SyncedPost', ARRAY['instagramMediaId', 'schoolId'])
  ), checked AS (
    SELECT r.*, c.oid, a.attnum, t.typname,
      a.attnum IS NOT NULL AND t.typname = ANY(r.types)
      AND NOT row_security_active(c.oid)
      AND (NOT r.read OR has_column_privilege(current_user, c.oid, a.attnum, 'SELECT'))
      AND (NOT r.insert OR has_column_privilege(current_user, c.oid, a.attnum, 'INSERT'))
      AND (NOT r.update OR has_column_privilege(current_user, c.oid, a.attnum, 'UPDATE')) AS ok
    FROM required r
    LEFT JOIN pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = r."table" AND c.relkind = 'r'
    LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = r."column" AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_type t ON t.oid = a.atttypid
  )
  SELECT COALESCE((SELECT bool_and(COALESCE(ok, false)) FROM checked), false)
    AND (SELECT bool_and(EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = u."table"
        AND i.indisunique AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = cardinality(u.columns)
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
          FROM unnest(i.indkey) WITH ORDINALITY k(attnum, pos)
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
          WHERE k.pos <= i.indnkeyatts) = u.columns
    )) FROM required_unique u)
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname = 'SyncedPost'
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull AND NOT a.atthasdef
        AND a.attidentity = '' AND a.attgenerated = ''
        AND NOT EXISTS (SELECT 1 FROM required r WHERE r."table" = 'SyncedPost' AND r."column" = a.attname)
    ) AS ready
`;

export type InstagramSyncSchemaClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export async function assertInstagramSyncSchema(prisma: InstagramSyncSchemaClient) {
  try {
    const result = await prisma.$queryRaw<Array<{ ready: boolean }>>(instagramSyncSchemaQuery);
    if (result.length !== 1 || result[0].ready !== true) throw new InstagramSyncUnavailableError();
  } catch {
    throw new InstagramSyncUnavailableError();
  }
}

export function requireInstagramSyncEndpoint() {
  try {
    const value = process.env.GBP_LOCAL_POSTS_API_URL?.trim();
    if (!value) throw new InstagramSyncUnavailableError();
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new InstagramSyncUnavailableError();
    return value;
  } catch { throw new InstagramSyncUnavailableError(); }
}

export function requireSyncValue(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new InstagramSyncUnavailableError();
}
