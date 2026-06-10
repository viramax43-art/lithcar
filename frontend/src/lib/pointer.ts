/** True on touch-first devices — used to skip autoFocus (keyboard pop-up) and grow hit areas. */
export const isCoarsePointer: boolean =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
