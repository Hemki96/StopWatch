import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Lauf, Satz, Schwimmer } from '../domain/types'

export interface BeckenrandDB extends DBSchema {
  schwimmer: {
    key: string
    value: Schwimmer
    indexes: { 'by-name': string }
  }
  satz: {
    key: string
    value: Satz
    indexes: { 'by-datum': string }
  }
  lauf: {
    key: string
    value: Lauf
    indexes: { 'by-satz': string }
  }
}

const DB_NAME = 'beckenrand'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<BeckenrandDB>> | null = null

export function getDb(): Promise<IDBPDatabase<BeckenrandDB>> {
  dbPromise ??= openDB<BeckenrandDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const schwimmer = db.createObjectStore('schwimmer', { keyPath: 'id' })
      schwimmer.createIndex('by-name', 'name')

      const satz = db.createObjectStore('satz', { keyPath: 'id' })
      satz.createIndex('by-datum', 'datum')

      const lauf = db.createObjectStore('lauf', { keyPath: 'id' })
      lauf.createIndex('by-satz', 'satzId')
    },
  })
  return dbPromise
}
