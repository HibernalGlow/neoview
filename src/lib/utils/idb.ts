// Simple IndexedDB helpers for storing small key-value data
export async function openDb(dbName = 'neoview', storeName = 'kv') {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function idbGet(key: string, dbName = 'neoview', storeName = 'kv') {
    const db = await openDb(dbName, storeName);
    return new Promise<any>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const rq = store.get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
    });
}

export async function idbSet(key: string, value: any, dbName = 'neoview', storeName = 'kv') {
    const db = await openDb(dbName, storeName);
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const rq = store.put(value, key);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error);
    });
}

export async function idbDelete(key: string, dbName = 'neoview', storeName = 'kv') {
    const db = await openDb(dbName, storeName);
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const rq = store.delete(key);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error);
    });
}
