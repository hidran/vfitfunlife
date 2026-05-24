import { collection, getDocs, orderBy, query, limit as limitQuery } from 'firebase/firestore';
import { db } from './config';
import type { Transaction } from '@/types/admin';

export async function fetchTransactions(opts: { limit?: number } = {}): Promise<Transaction[]> {
  try {
    const constraints = [orderBy('createdAt', 'desc')];
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q = query(collection(db, 'transactions'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }));
  } catch (error) {
    console.error('[fetchTransactions]', opts, error);
    return [];
  }
}
