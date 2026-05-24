import {
  collection, query, where, getDocs, limit as limitQuery,
  type Query, type CollectionReference,
} from 'firebase/firestore';
import { db } from './config';
import type {
  FitnessClass, HomeTrainingService, VirtualProgram, ClassCategory,
} from '@/types/fitness';

export async function fetchFitnessClasses(opts: { category?: ClassCategory; limit?: number } = {}): Promise<FitnessClass[]> {
  try {
    const constraints = [where('isActive', '==', true)];
    if (opts.category) constraints.push(where('category', '==', opts.category));
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q: Query | CollectionReference = constraints.length
      ? query(collection(db, 'fitnessClasses'), ...constraints)
      : collection(db, 'fitnessClasses');
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FitnessClass, 'id'>) }));
  } catch (error) {
    console.error('[fetchFitnessClasses]', opts, error);
    return [];
  }
}

export async function fetchHomeTrainingServices(opts: { limit?: number } = {}): Promise<HomeTrainingService[]> {
  try {
    const constraints = [where('isActive', '==', true)];
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q: Query | CollectionReference = query(collection(db, 'homeTrainingServices'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HomeTrainingService, 'id'>) }));
  } catch (error) {
    console.error('[fetchHomeTrainingServices]', opts, error);
    return [];
  }
}

export async function fetchVirtualPrograms(opts: { limit?: number } = {}): Promise<VirtualProgram[]> {
  try {
    const constraints = [where('isActive', '==', true)];
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q: Query | CollectionReference = query(collection(db, 'virtualPrograms'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VirtualProgram, 'id'>) }));
  } catch (error) {
    console.error('[fetchVirtualPrograms]', opts, error);
    return [];
  }
}
