/**
 * framer-motion's `domAnimation` feature pack, in a module of its own so that `LazyMotion`
 * can `import()` it: the page then ships only the small `m` renderer in its first load and
 * fetches the animation code (~25 KB raw) right after mount. Until it arrives, `m.*` elements
 * render their `initial` styles and animate once it does (framer-motion's documented
 * asynchronous LazyMotion mode).
 */
export { domAnimation as default } from 'framer-motion';
