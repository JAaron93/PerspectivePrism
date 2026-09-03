import type { TruthTheoryType } from '../types';

const THEORY_PREFIX_MAP: Readonly<Record<string, string>> = {
  Correspondence: 'theory-correspondence',
  Coherence: 'theory-coherence',
  Pragmatic: 'theory-pragmatic',
  Perspectivism: 'theory-perspectivism',
  Consensus: 'theory-consensus',
  Deflationary: 'theory-deflationary',
};

/**
 * Maps a canonical truth theory type to its corresponding CSS class name for badges/chips
 * using an O(1) monomorphic map lookup.
 *
 * @param theory Canonical truth theory string
 * @returns CSS class name string
 */
export const getTheoryColorClass = (theory: TruthTheoryType): string => {
  const prefix = theory.split(' ')[0];
  return THEORY_PREFIX_MAP[prefix] ?? 'theory-default';
};
