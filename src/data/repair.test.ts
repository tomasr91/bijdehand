import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, switchDb } from './db';
import { buildItem } from './repo';
import { repairDuplicates } from './repair';

let k = 0;
beforeEach(() => { switchDb(`repair-${++k}`); });

const claudeItem = (title: string, at: string, extra: Partial<Parameters<typeof buildItem>[0]> = {}) => {
  const i = buildItem({ type: 'restaurant', title, fields: { city: 'Leiden', cuisine: 'Afghaans' }, origin: { system: 'claude', ref: 'Notitie', at }, ...extra });
  return { ...i, createdAt: at, updatedAt: at };
};

describe('dubbele kopieën herstellen', () => {
  it('haalt alleen een overduidelijke kopie weg (door Claude, zelfde aantekening, binnen 5 s, gelijke inhoud)', async () => {
    const a = claudeItem('Pamir', '2026-10-24T20:41:50.458Z');
    const b = { ...claudeItem('Pamir', '2026-10-24T20:41:50.691Z'), fields: { city: 'Leiden', cuisine: 'Afghaans', lat: 52.1, lng: 4.4, geoFor: 'x' } };
    const later = claudeItem('Groen', '2026-10-24T21:00:00.000Z');
    const laterCopy = claudeItem('Groen', '2026-10-24T21:10:00.000Z'); // 10 min later: bewust opnieuw, niet aanraken
    const edited = claudeItem('Jozef', '2026-10-24T20:41:50.458Z');
    const editedCopy = { ...claudeItem('Jozef', '2026-10-24T20:41:50.691Z'), body: 'Mijn notitie' }; // verschilt: niet aanraken
    const own = buildItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', cuisine: 'Afghaans' } }); // niet van Claude
    await db.items.bulkAdd([a, b, later, laterCopy, edited, editedCopy, own]);
    expect(await repairDuplicates()).toEqual([b.id]);
    expect((await db.items.get(a.id))?.deletedAt).toBeNull();
    expect((await db.items.get(b.id))?.deletedAt).toBeTruthy();
    expect(await repairDuplicates()).toEqual([]);
  });
});
