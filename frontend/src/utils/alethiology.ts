import type { TruthTheoryType } from '../types';

/**
 * Maps a canonical truth theory type to its corresponding CSS class name for badges/chips.
 *
 * @param theory Canonical truth theory string
 * @returns CSS class name string
 */
export const getTheoryColorClass = (theory: TruthTheoryType): string => {
  if (theory.startsWith('Correspondence')) return 'theory-correspondence';
  if (theory.startsWith('Coherence')) return 'theory-coherence';
  if (theory.startsWith('Pragmatic')) return 'theory-pragmatic';
  if (theory.startsWith('Perspectivism')) return 'theory-perspectivism';
  if (theory.startsWith('Consensus')) return 'theory-consensus';
  if (theory.startsWith('Deflationary')) return 'theory-deflationary';
  return 'theory-default';
};
