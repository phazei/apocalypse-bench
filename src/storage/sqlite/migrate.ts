import fs from 'node:fs';
import path from 'node:path';
import { openDb, type DbHandle } from './db';

export function migrate(db: DbHandle): void {
  // Fix for Windows: fileURLToPath handles the leading slash correctly
  const schemaPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
    'schema.sql',
  );
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
}

export function openAndMigrate(sharedDbPath: string): DbHandle {
  const db = openDb(sharedDbPath);
  migrate(db);
  return db;
}
