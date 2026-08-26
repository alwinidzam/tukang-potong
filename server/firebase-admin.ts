import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  Firestore
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let firestoreInstance: Firestore | null = null;

export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.warn('[Firebase] firebase-applet-config.json not found');
      return null;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    };

    const app = !getApps().length ? initializeApp(firebaseConfig, 'server-firestore') : getApp('server-firestore');
    firestoreInstance = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);

    console.log('[Firebase] Server Firestore initialized successfully for project:', config.projectId);
    return firestoreInstance;
  } catch (error) {
    console.error('[Firebase] Failed to initialize Firestore:', error);
    return null;
  }
}

/**
 * Sync entire dataset to Firestore in batches
 */
export async function syncToFirestore(data: {
  users: any[];
  queues: any[];
  master_hpp: any[];
  services: any[];
  service_hpp_relations: any[];
  transactions: any[];
  notifications: any[];
}): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const sanitizedUsers = (data.users || []).map(u => {
      const { password_hash, password, ...safeUser } = u;
      return safeUser;
    });

    const collectionsToSync: Record<string, any[]> = {
      users: sanitizedUsers,
      queues: data.queues || [],
      master_hpp: data.master_hpp || [],
      services: data.services || [],
      service_hpp_relations: (data.service_hpp_relations || []).map((rel, idx) => ({
        id: `rel-${rel.service_id}-${rel.hpp_id}-${idx}`,
        ...rel,
      })),
      transactions: data.transactions || [],
      notifications: data.notifications || [],
    };

    for (const [colName, items] of Object.entries(collectionsToSync)) {
      // Reconcile and purge removed/dummy documents from Firestore
      try {
        const existingSnap = await getDocs(collection(db, colName));
        const validIds = new Set(items.map(i => String(i.id || '')));
        const deleteBatch = writeBatch(db);
        let deleteCount = 0;

        for (const docSnap of existingSnap.docs) {
          if (!validIds.has(docSnap.id)) {
            deleteBatch.delete(docSnap.ref);
            deleteCount++;
          }
        }
        if (deleteCount > 0) {
          await deleteBatch.commit();
        }
      } catch (colErr) {
        console.warn(`[Firestore] Purge note for collection ${colName}:`, colErr);
      }

      if (items.length === 0) continue;
      
      const batch = writeBatch(db);
      for (const item of items) {
        const docId = item.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const docRef = doc(db, colName, String(docId));
        batch.set(docRef, item, { merge: true });
      }
      await batch.commit();
    }

    return true;
  } catch (err) {
    console.error('[Firebase Sync Error]:', err);
    return false;
  }
}

/**
 * Load dataset from Firestore
 */
export async function loadFromFirestore(): Promise<any | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const collections = ['users', 'queues', 'master_hpp', 'services', 'service_hpp_relations', 'transactions', 'notifications'];
    const result: Record<string, any[]> = {};

    for (const col of collections) {
      const snap = await getDocs(collection(db, col));
      result[col] = snap.docs.map(d => d.data());
    }

    // Filter out artificial ID from relations if needed
    if (result.service_hpp_relations) {
      result.service_hpp_relations = result.service_hpp_relations.map(r => {
        const { id, ...rest } = r;
        return rest;
      });
    }

    // Check if firestore actually had populated collections
    const totalDocs = Object.values(result).reduce((acc, curr) => acc + curr.length, 0);
    if (totalDocs === 0) {
      return null;
    }

    return result;
  } catch (err) {
    console.error('[Firebase Load Error]:', err);
    return null;
  }
}

/**
 * Instant real-time single queue write to Firestore
 */
export async function syncSingleQueueToFirestore(queue: any): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !queue || !queue.id) return false;
  try {
    const docRef = doc(db, 'queues', String(queue.id));
    await setDoc(docRef, queue, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Single Queue Write Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single queue delete from Firestore
 */
export async function deleteSingleQueueFromFirestore(queueId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !queueId) return false;
  try {
    const docRef = doc(db, 'queues', String(queueId));
    await deleteDoc(docRef);
    return true;
  } catch (e) {
    console.warn('[Firestore Single Queue Delete Error]:', e);
    return false;
  }
}
