import Dexie, { type EntityTable } from 'dexie';
import { migrateItem } from './migrate';
import type { Item, Link, MetaEntry, Revision, Source } from './model';

// Lokale database (IndexedDB). Elke schemawijziging = nieuwe .version() met migratie,
// zie docs/DATA_MODEL.md → Migraties. Nooit een bestaande versie aanpassen.
export class BijdehandDB extends Dexie {
  items!: EntityTable<Item, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  links!: EntityTable<Link, 'id'>;
  revisions!: EntityTable<Revision, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'bijdehand') {
    super(name);
    this.version(1).stores({
      items: 'id, type, updatedAt, createdAt, deletedAt',
      sources: 'id, normalizedUrl, updatedAt, deletedAt',
      links: 'id, aId, bId, deletedAt',
      revisions: 'id, entityId, [entityId+changedAt]',
      meta: 'key',
    });
    // v2: restaurants krijgen plaats/keuken/kenmerken (zie migrate.ts).
    this.version(2).stores({}).upgrade(async (tx) => {
      await tx.table('items').toCollection().modify((item: Item) => {
        Object.assign(item, migrateItem(item));
        if (item.type === 'restaurant') delete item.fields.location;
      });
    });
    // v3: restaurant-sterren (1–5) worden een eigen cijfer 1–10 (zie migrate.ts).
    this.version(3).stores({}).upgrade(async (tx) => {
      await tx.table('items').toCollection().modify((item: Item) => {
        Object.assign(item, migrateItem(item));
      });
    });
    // v4: restaurantstatus wordt afgeleid van het cijfer; "favoriet" wordt een hartje (zie migrate.ts).
    this.version(4).stores({}).upgrade(async (tx) => {
      await tx.table('items').toCollection().modify((item: Item) => {
        Object.assign(item, migrateItem(item));
      });
    });
  }
}

export let db = new BijdehandDB();

/** Alleen voor tests: gebruik een aparte, lege database. */
export function switchDb(name: string): BijdehandDB {
  db = new BijdehandDB(name);
  return db;
}
