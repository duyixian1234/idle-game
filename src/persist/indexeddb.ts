import { isValidSave } from '../engine/save'
import type { GameState } from '../engine/types'

const DB_NAME = 'idle-game'
const DB_VERSION = 1
const STORE = 'save'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
}

/** 读取存档；无存档或存档非法返回 null */
export async function loadGame(): Promise<GameState | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const get = tx.objectStore(STORE).get(KEY)
      get.onsuccess = () => {
        const raw = get.result as GameState | undefined
        resolve(raw && isValidSave(raw) ? raw : null)
      }
      get.onerror = () => reject(get.error)
    })
  } catch {
    return null
  }
}

/** 保存存档（自动保存入口，调用方节流） */
export async function saveGame(state: GameState): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(state, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 清空存档（新游戏/重置用） */
export async function deleteSave(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
