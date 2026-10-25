// Gegevensmodel — zie docs/DATA_MODEL.md. Wijzig dit bestand alleen samen met die doc.

export const SCHEMA_VERSION = 5;

export type TypeKey = 'restaurant' | 'album' | 'packing';

export type FieldValue = string | number | boolean | string[] | null;

export interface ChecklistEntry {
  id: string;
  text: string;
  done: boolean;
}

/** Herkomst van een record dat niet in de app zelf is getypt. */
export interface Origin {
  system: 'sample' | 'backup' | 'share' | 'google-keep' | 'paste' | 'claude';
  ref?: string;
  at: string;
}

/** Voorstel voor een soort. `by` maakt zichtbaar wie het voorstel deed (nu alleen vaste regels). */
export interface Suggestion {
  type: TypeKey;
  reason: string;
  by: 'regels' | 'ai';
}

export interface Item {
  id: string;
  /** null = nog niet ingedeeld → staat in de Inbox. */
  type: TypeKey | null;
  title: string;
  /** Eigen notities van de gebruiker (vrije tekst). */
  body: string;
  /** Typespecifieke velden, sleutels gedefinieerd in itemTypes.ts. */
  fields: Record<string, FieldValue>;
  checklist: ChecklistEntry[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
  origin: Origin | null;
  suggestion: Suggestion | null;
  /** Wie velden automatisch invulde (bijv. Claude via een voorstellenbestand). Ontbreekt = zelf ingevuld. */
  filledBy?: FilledBy | null;
  schemaVersion: number;
}

export interface FilledBy {
  by: 'claude';
  at: string;
  /** Welke onderdelen zijn ingevuld of gewijzigd: 'type', 'title', 'body', 'tags', 'checklist' of veldnamen. */
  fields: string[];
}

export interface Source {
  id: string;
  url: string;
  /** Genormaliseerde URL voor duplicaatherkenning. */
  normalizedUrl: string;
  /** Externe broninformatie (van de website) — los van eigen notitie. */
  title: string;
  site: string;
  description: string;
  imageUrl: string;
  /** Hoe de externe informatie is verkregen; nooit stilzwijgend als 'opgehaald' tonen. */
  infoVia: 'handmatig' | 'deelmenu' | 'import' | 'voorbeeld' | 'opgezocht';
  /** Eigen opmerking: waarom is deze bron interessant. */
  note: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
  origin: Origin | null;
  schemaVersion: number;
}

export type EntityKind = 'item' | 'source';

/** Ongerichte relatie tussen twee records (item↔item of item↔bron). */
export interface Link {
  id: string;
  aKind: EntityKind;
  aId: string;
  bKind: EntityKind;
  bId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Momentopname van een record vóór een wijziging. */
export interface Revision {
  id: string;
  kind: EntityKind;
  entityId: string;
  rev: number;
  snapshot: Item | Source;
  changedAt: string;
}

export interface MetaEntry {
  key: string;
  value: string;
}
