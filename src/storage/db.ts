/**
 * IndexedDB-Schema und Verbindungsaufbau.
 *
 * Öffnet die Datenbank `beckenrand` genau einmal pro Tab und hält die
 * Verbindung als Promise fest. Das Schema besteht aus fünf Object Stores
 * (Schwimmer, Satz, Lauf, Wettkampf, Training), die über `id` adressiert und
 * über Indizes für Datum, Satzzuordnung und Wettkampfzuordnung erschlossen
 * werden. Migrationen sind rein additiv: Jede Schema-Version legt nur neue
 * Stores und Indizes an, bestehende Daten werden nie umgeschrieben.
 *
 * Datenfluss: `repository.ts` ist der einzige fachliche Aufrufer; alle
 * Schreib- und Lesezugriffe laufen über `getDb()`. Da IndexedDB-Verbindungen
 * tabgebunden sind, koordinieren die Callbacks `blocked`, `blocking` und
 * `terminated` das Zusammenspiel mehrerer Tabs bzw. App-Versionen.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Lauf, Satz, Schwimmer, Training, Wettkampf } from '../domain/types'

/**
 * Typschema der Datenbank.
 *
 * Jeder Eintrag beschreibt einen Object Store mit Schlüsselpfad (`key`), dem
 * gespeicherten Domänentyp (`value`) und den verfügbaren Indizes. Die Schlüssel
 * sind die `id`-Felder der Domänenobjekte, sodass ein `put` immer ein Upsert
 * auf genau diesem Datensatz ist.
 */
export interface BeckenrandDB extends DBSchema {
  schwimmer: {
    key: string
    value: Schwimmer
    indexes: { 'by-name': string }
  }
  satz: {
    key: string
    value: Satz
    // `by-datum` sortiert Sätze tagesweise; `by-wettkampf` findet die
    // Disziplinen eines Wettkampfs für das kaskadierte Löschen.
    indexes: { 'by-datum': string; 'by-wettkampf': string }
  }
  lauf: {
    key: string
    value: Lauf
    // Läufe hängen über `satzId` an einem Satz. Der Index ersetzt eine
    // Fremdschlüsselbeziehung und wird beim Löschen eines Satzes benötigt.
    indexes: { 'by-satz': string }
  }
  wettkampf: {
    key: string
    value: Wettkampf
    indexes: { 'by-datum': string }
  }
  training: {
    key: string
    value: Training
    indexes: { 'by-datum': string }
  }
}

const DB_NAME = 'beckenrand'
// Muss bei jeder Schemaänderung erhöht werden; der `upgrade`-Callback unten
// entscheidet anhand der alten Version, welche Schritte nachzuholen sind.
const DB_VERSION = 3

// Einmal geöffnete Verbindung pro Tab. Das Promise verhindert parallele
// `openDB`-Aufrufe, die sonst mehrere Verbindungen öffnen würden.
let dbPromise: Promise<IDBPDatabase<BeckenrandDB>> | null = null

/**
 * Liefert die geteilte Datenbankverbindung und öffnet sie beim ersten Aufruf.
 *
 * Der Rückgabewert ist immer dasselbe Promise, solange die Verbindung lebt.
 * Nach einem `terminated`-Ereignis wird es zurückgesetzt, sodass der nächste
 * Aufruf die Datenbank neu öffnet. Fehler beim Öffnen (z. B. blockiertes
 * Upgrade) werden über das Promise weitergereicht.
 */
export function getDb(): Promise<IDBPDatabase<BeckenrandDB>> {
  dbPromise ??= openDB<BeckenrandDB>(DB_NAME, DB_VERSION, {
    upgrade(db, alteVersion, _neueVersion, transaction) {
      // Version 1: Grundschema aus Schwimmern, Sätzen und Läufen.
      if (alteVersion < 1) {
        const schwimmer = db.createObjectStore('schwimmer', { keyPath: 'id' })
        schwimmer.createIndex('by-name', 'name')

        const satz = db.createObjectStore('satz', { keyPath: 'id' })
        satz.createIndex('by-datum', 'datum')

        const lauf = db.createObjectStore('lauf', { keyPath: 'id' })
        lauf.createIndex('by-satz', 'satzId')
      }

      // Version 2: Wettkämpfe als eigener Rahmen; der Satz bekommt zusätzlich
      // einen Index auf die Wettkampfzuordnung.
      if (alteVersion < 2) {
        const wettkampf = db.createObjectStore('wettkampf', { keyPath: 'id' })
        wettkampf.createIndex('by-datum', 'datum')
        // Sätze aus Version 1 kennen die Spalte noch nicht; der Index bleibt
        // für sie einfach leer.
        transaction.objectStore('satz').createIndex('by-wettkampf', 'wettkampfId')
      }

      // Version 3: Trainingspläne als eigener Store. Sie hängen nicht an
      // Sätzen; erst beim Start eines Trainingssatzes entstehen Satz und Läufe.
      if (alteVersion < 3) {
        const training = db.createObjectStore('training', { keyPath: 'id' })
        training.createIndex('by-datum', 'datum')
      }
    },
    blocked(alteVersion) {
      // Tritt auf, wenn ein Tab mit einer älteren App-Version die Datenbank
      // noch offen hält. Der Aufruf wartet, bis dieser Tab geschlossen ist.
      // In der Zwischenzeit ist die App nicht schreibfähig.
      console.error(
        `Datenbank-Upgrade blockiert: Ein Tab mit Version ${alteVersion} ist noch geöffnet.`,
      )
    },
    blocking(alteVersion) {
      // Diese Verbindung verhindert das Upgrade eines neueren Tabs.
      console.warn(
        `Diese App-Version (${alteVersion}) blockiert ein Datenbank-Upgrade. Bitte diesen Tab schließen.`,
      )
    },
    terminated() {
      // Nach einem Absturz des Verbindungsprozesses neu öffnen können.
      dbPromise = null
    },
  })
  return dbPromise
}
