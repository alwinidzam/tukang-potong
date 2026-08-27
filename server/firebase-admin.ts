import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
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
  revoked_tokens?: string[];
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
      service_hpp_relations: (data.service_hpp_relations || []).map((rel) => ({
        id: `rel-${rel.service_id}-${rel.hpp_id}`,
        ...rel,
      })),
      transactions: data.transactions || [],
      notifications: data.notifications || [],
    };

    for (const [colName, items] of Object.entries(collectionsToSync)) {
      if (!items || items.length === 0) continue;
      
      const batch = writeBatch(db);
      for (const item of items) {
        const docId = item.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const docRef = doc(db, colName, String(docId));
        batch.set(docRef, item, { merge: true });
      }
      await batch.commit();
    }

    if (data.revoked_tokens) {
      await setDoc(doc(db, 'system', 'config'), { revoked_tokens: data.revoked_tokens }, { merge: true });
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

    // Deduplicate and filter out artificial ID from relations
    if (result.service_hpp_relations) {
      const relMap = new Map<string, any>();
      for (const r of result.service_hpp_relations) {
        if (r && r.service_id && r.hpp_id) {
          const key = `${r.service_id}___${r.hpp_id}`;
          relMap.set(key, {
            service_id: r.service_id,
            hpp_id: r.hpp_id,
            quantity_used: Math.max(1, Number(r.quantity_used) || 1),
          });
        }
      }
      result.service_hpp_relations = Array.from(relMap.values());
    }

    // Check if firestore actually had populated collections
    const totalDocs = Object.values(result).reduce((acc, curr) => acc + curr.length, 0);
    if (totalDocs === 0) {
      return null;
    }

    // Load revoked_tokens from system collection
    try {
      const { getDoc } = await import('firebase/firestore');
      const sysDoc = await getDoc(doc(db, 'system', 'config'));
      if (sysDoc.exists()) {
        result.revoked_tokens = sysDoc.data().revoked_tokens || [];
      }
    } catch (_) {}

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

/**
 * Fast direct fetch of all queues from Firestore
 */
export async function loadQueuesFromFirestore(): Promise<any[] | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  try {
    const { query, where, collection, getDocs } = await import('firebase/firestore');
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const q = query(collection(db, 'queues'), where('queue_date', '==', todayStr));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (e) {
    console.warn('[Firestore loadQueuesFromFirestore Note]:', e);
    return null;
  }
}

/**
 * Instant real-time single Master HPP write to Firestore
 */
export async function syncSingleHPPToFirestore(item: any): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !item || !item.id) return false;
  try {
    const docRef = doc(db, 'master_hpp', String(item.id));
    await setDoc(docRef, item, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Single HPP Write Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single Master HPP delete from Firestore
 */
export async function deleteSingleHPPFromFirestore(hppId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !hppId) return false;
  try {
    const docRef = doc(db, 'master_hpp', String(hppId));
    await deleteDoc(docRef);

    // Also delete any matching relations from service_hpp_relations collection
    try {
      const relSnap = await getDocs(collection(db, 'service_hpp_relations'));
      const batch = writeBatch(db);
      let count = 0;
      for (const d of relSnap.docs) {
        const data = d.data();
        if (data.hpp_id === hppId) {
          batch.delete(d.ref);
          count++;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    } catch (_) {}

    return true;
  } catch (e) {
    console.warn('[Firestore Single HPP Delete Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single Service write to Firestore
 */
export async function syncSingleServiceToFirestore(service: any, relations?: any[]): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !service || !service.id) return false;
  try {
    const docRef = doc(db, 'services', String(service.id));
    await setDoc(docRef, service, { merge: true });

    if (Array.isArray(relations)) {
      const relSnap = await getDocs(collection(db, 'service_hpp_relations'));
      const batch = writeBatch(db);
      let count = 0;
      for (const d of relSnap.docs) {
        if (d.data().service_id === service.id) {
          batch.delete(d.ref);
          count++;
        }
      }
      for (let i = 0; i < relations.length; i++) {
        const r = relations[i];
        const rId = `rel-${service.id}-${r.hpp_id}`;
        const ref = doc(db, 'service_hpp_relations', rId);
        batch.set(ref, { id: rId, ...r }, { merge: true });
        count++;
      }
      if (count > 0) {
        await batch.commit();
      }
    }
    return true;
  } catch (e) {
    console.warn('[Firestore Single Service Write Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single Service delete from Firestore
 */
export async function deleteSingleServiceFromFirestore(serviceId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !serviceId) return false;
  try {
    const docRef = doc(db, 'services', String(serviceId));
    await deleteDoc(docRef);

    const relSnap = await getDocs(collection(db, 'service_hpp_relations'));
    const batch = writeBatch(db);
    let count = 0;
    for (const d of relSnap.docs) {
      if (d.data().service_id === serviceId) {
        batch.delete(d.ref);
        count++;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
    return true;
  } catch (e) {
    console.warn('[Firestore Single Service Delete Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single User write to Firestore
 */
export async function syncSingleUserToFirestore(user: any): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !user || !user.id) return false;
  try {
    const { password_hash, password, ...safeUser } = user;
    const docRef = doc(db, 'users', String(safeUser.id));
    await setDoc(docRef, safeUser, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Single User Write Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single User delete from Firestore
 */
export async function deleteSingleUserFromFirestore(userId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !userId) return false;
  try {
    const docRef = doc(db, 'users', String(userId));
    await deleteDoc(docRef);
    return true;
  } catch (e) {
    console.warn('[Firestore Single User Delete Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single Transaction write to Firestore
 */
export async function syncSingleTransactionToFirestore(transaction: any): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !transaction || !transaction.id) return false;
  try {
    const docRef = doc(db, 'transactions', String(transaction.id));
    await setDoc(docRef, transaction, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Single Transaction Write Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single Notification write to Firestore
 */
export async function syncSingleNotificationToFirestore(notif: any): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !notif || !notif.id) return false;
  try {
    const docRef = doc(db, 'notifications', String(notif.id));
    await setDoc(docRef, notif, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Single Notification Write Error]:', e);
    return false;
  }
}

/**
 * Instant real-time single Revoked Tokens write to Firestore
 */
export async function syncSingleRevokedTokensToFirestore(tokens: string[]): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const docRef = doc(db, 'system', 'config');
    await setDoc(docRef, { revoked_tokens: tokens }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Single Revoked Tokens Write Error]:', e);
    return false;
  }
}

/**
 * Safely generate a monotonically increasing queue number via atomic transaction
 */
export async function getAtomicQueueNumber(dateStr: string, fallbackLocalMax: number): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return fallbackLocalMax;

  try {
    const counterRef = doc(db, 'system', `queue_counter_${dateStr}`);
    return await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(counterRef);
      if (!sfDoc.exists()) {
        const newMax = Math.max(1, fallbackLocalMax);
        transaction.set(counterRef, { currentMax: newMax });
        return newMax;
      } else {
        const currentMax = sfDoc.data().currentMax || 0;
        const nextNum = Math.max(currentMax + 1, fallbackLocalMax);
        transaction.update(counterRef, { currentMax: nextNum });
        return nextNum;
      }
    });
  } catch (e) {
    console.warn('[Firestore Atomic Counter Error]:', e);
    return fallbackLocalMax;
  }
}

