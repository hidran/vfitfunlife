// The Firestore pieces root-path code needs, bundled as ONE lazily loaded module. Only
// ./lazyFirestore may import this, and only with a dynamic import(): a static import would
// put the Firestore SDK back into the shared root bundle.
//
// Named re-exports (not `import * as`) keep the SDK tree-shakeable. Add a name here when
// a root-path module needs another Firestore function.
export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
export { db } from "./config";
