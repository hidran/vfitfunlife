import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  DocumentSnapshot,
  QueryConstraint,
  onSnapshot,
  Timestamp,
  GeoPoint,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";

// Re-export Firestore types and utilities
export {
  Timestamp,
  GeoPoint,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
};

// Collection references
export const collections = {
  users: "users",
  venues: "venues",
  instructors: "instructors",
  fitnessClasses: "fitnessClasses",
  bookings: "bookings",
  classBookings: "classBookings",
  events: "events",
  serviceCategories: "serviceCategories",
  vipPlans: "vipPlans",
  challenges: "challenges",
  promotions: "promotions",
  streamingSchedule: "streamingSchedule",
};

// Generic document fetcher
export async function getDocument<T>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as T;
  }
  return null;
}

// Generic collection fetcher with query support
export async function getCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const colRef = collection(db, collectionName);
  const q = query(colRef, ...constraints);
  const querySnap = await getDocs(q);

  return querySnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as T[];
}

// Paginated collection fetcher
export async function getPaginatedCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  pageSize: number = 10,
  lastDoc?: DocumentSnapshot
): Promise<{ data: T[]; lastDoc: DocumentSnapshot | null }> {
  const colRef = collection(db, collectionName);

  const queryConstraints = [...constraints, limit(pageSize)];
  if (lastDoc) {
    queryConstraints.push(startAfter(lastDoc));
  }

  const q = query(colRef, ...queryConstraints);
  const querySnap = await getDocs(q);

  const data = querySnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as T[];

  const newLastDoc = querySnap.docs[querySnap.docs.length - 1] || null;

  return { data, lastDoc: newLastDoc };
}

// Real-time document listener
export function subscribeToDocument<T>(
  collectionName: string,
  documentId: string,
  callback: (data: T | null) => void
): () => void {
  const docRef = doc(db, collectionName, documentId);

  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() } as T);
    } else {
      callback(null);
    }
  });
}

// Real-time collection listener
export function subscribeToCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  callback: (data: T[]) => void
): () => void {
  const colRef = collection(db, collectionName);
  const q = query(colRef, ...constraints);

  return onSnapshot(q, (querySnap) => {
    const data = querySnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];
    callback(data);
  });
}

// Create document
export async function createDocument<T extends Record<string, any>>(
  collectionName: string,
  data: T,
  documentId?: string
): Promise<string> {
  const dataWithTimestamp = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (documentId) {
    const docRef = doc(db, collectionName, documentId);
    await setDoc(docRef, dataWithTimestamp);
    return documentId;
  } else {
    const colRef = collection(db, collectionName);
    const docRef = await addDoc(colRef, dataWithTimestamp);
    return docRef.id;
  }
}

// Update document
export async function updateDocument(
  collectionName: string,
  documentId: string,
  data: Record<string, any>
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// Delete document
export async function deleteDocument(
  collectionName: string,
  documentId: string
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  await deleteDoc(docRef);
}

// Batch operations
export function createBatch() {
  return writeBatch(db);
}

// Subcollection helpers
export async function getSubcollection<T>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const colRef = collection(db, parentCollection, parentId, subcollectionName);
  const q = query(colRef, ...constraints);
  const querySnap = await getDocs(q);

  return querySnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as T[];
}

export function subscribeToSubcollection<T>(
  parentCollection: string,
  parentId: string,
  subcollectionName: string,
  constraints: QueryConstraint[],
  callback: (data: T[]) => void
): () => void {
  const colRef = collection(db, parentCollection, parentId, subcollectionName);
  const q = query(colRef, ...constraints);

  return onSnapshot(q, (querySnap) => {
    const data = querySnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];
    callback(data);
  });
}

// Query builder helpers
export { where, orderBy, limit, startAfter };
