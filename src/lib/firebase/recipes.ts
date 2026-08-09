/**
 * Recipe queries. Read the query shapes carefully — Firestore evaluates list rules against the
 * QUERY, so `listSharedWithClient` MUST constrain ownerUid as well as array-contains, or the
 * whole query is denied. See the spec §6.4.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp,
  type QuerySnapshot, type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from './config';
import type { Recipe, RecipeParams } from '@/types/recipes';

const RECIPES = 'recipes';

function uid(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error('Not authenticated');
  return u;
}

function toIso(v: unknown): string | undefined {
  return v instanceof Timestamp ? v.toDate().toISOString() : undefined;
}

// NB: must be QuerySnapshot<DocumentData>, not Awaited<ReturnType<typeof getDocs>> — the
// latter resolves d.data() to `unknown` and the file will not compile.
function mapDocs(snap: QuerySnapshot<DocumentData>): Recipe[] {
  return snap.docs.map((d) => {
    const { createdAt, updatedAt, ...rest } = d.data();
    return {
      id: d.id, ...rest,
      tags: rest.tags ?? [],
      sharedWithUserIds: rest.sharedWithUserIds ?? [],
      createdAt: toIso(createdAt), updatedAt: toIso(updatedAt),
    } as Recipe;
  });
}

/** Everything I own — the trainer library, and the client's "Le mie ricette". */
export async function listMyRecipes(): Promise<Recipe[]> {
  return mapDocs(await getDocs(query(
    collection(db, RECIPES),
    where('ownerUid', '==', uid()),
    orderBy('createdAt', 'desc'),
  )));
}

/** Everything shared with me — the client's "Consigliate dal tuo trainer". */
export async function listSharedWithMe(): Promise<Recipe[]> {
  return mapDocs(await getDocs(query(
    collection(db, RECIPES),
    where('sharedWithUserIds', 'array-contains', uid()),
    orderBy('createdAt', 'desc'),
  )));
}

/**
 * What I have shared with one specific client.
 * The ownerUid constraint is MANDATORY: without it the rule cannot authorize the query and
 * Firestore denies it outright, even though every document returned would have been readable.
 */
export async function listSharedWithClient(clientUserId: string): Promise<Recipe[]> {
  return mapDocs(await getDocs(query(
    collection(db, RECIPES),
    where('ownerUid', '==', uid()),
    where('sharedWithUserIds', 'array-contains', clientUserId),
    orderBy('createdAt', 'desc'),
  )));
}

export async function createRecipe(
  data: Omit<Recipe, 'id' | 'source' | 'ownerUid' | 'ownerRole' | 'sharedWithUserIds' | 'createdAt' | 'updatedAt'>,
  ownerRole: Recipe['ownerRole'],
): Promise<string> {
  const ref = await addDoc(collection(db, RECIPES), {
    ...data,
    source: 'manual',
    ownerUid: uid(),
    ownerRole,
    sharedWithUserIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRecipe(id: string, patch: Partial<Recipe>): Promise<void> {
  const { id: _i, ownerUid: _o, ownerRole: _r, source: _s, createdAt: _c, updatedAt: _u, ...rest } = patch;
  await updateDoc(doc(db, RECIPES, id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteRecipe(id: string): Promise<void> {
  await deleteDoc(doc(db, RECIPES, id));
}

export async function shareRecipe(id: string, userId: string): Promise<void> {
  await updateDoc(doc(db, RECIPES, id), {
    sharedWithUserIds: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function unshareRecipe(id: string, userId: string): Promise<void> {
  await updateDoc(doc(db, RECIPES, id), {
    sharedWithUserIds: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function aiGenerateRecipes(
  params: RecipeParams, locale: string,
): Promise<{ recipes: Recipe[]; dropped: number }> {
  const fn = httpsCallable<{ params: RecipeParams; locale: string }, { recipes: Recipe[]; dropped: number }>(
    functions, 'generateRecipes',
  );
  return (await fn({ params, locale })).data;
}
