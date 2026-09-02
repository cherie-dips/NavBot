/**
 * Streaming cadence.
 *
 * A generated answer arrives as many small deltas — sometimes several a second,
 * forty — and rendering each one straight to the DOM shows the visitor the network's
 * rhythm rather than a reading rhythm. Deltas are buffered here and released a whole
 * block at a time on a steady cadence, so text arrives as lines instead of twitching
 * word by word.
 *
 * Nothing about the transport changes: the server still streams as fast as it can and
 * time-to-first-token is unaffected. This only governs when arrived text is painted.
 */

/** A block is a paragraph or bullet. Long paragraphs break at a sentence instead. */
export const SOFT_BLOCK_CHARS = 140;

/**
 * How far into `buffer` the next block ends, or -1 while no boundary has arrived yet.
 * Returning -1 rather than a partial block is what removes the word-by-word jitter.
 */
export function nextBlockEnd(buffer: string, streamDone: boolean): number {
  const newline = buffer.indexOf("\n");
  if (newline !== -1) {
    // Absorb the blank line of a paragraph break into the same block. Left on its own it
    // becomes a release that paints nothing, spending a tick and breaking the rhythm.
    let end = newline + 1;
    while (end < buffer.length && (buffer[end] === "\n" || buffer[end] === "\r")) end++;
    return end;
  }

  // No newline yet. A paragraph long enough to read on its own can break at a sentence,
  // so a single long lead paragraph does not land as one lump.
  if (buffer.length >= SOFT_BLOCK_CHARS) {
    const sentence = buffer.search(/[.!?]["')\]]?\s/);
    if (sentence !== -1) {
      const after = buffer.slice(sentence).search(/\s/);
      if (after !== -1) return sentence + after + 1;
    }
  }

  // Once the stream has closed there is nothing more coming, so flush the remainder.
  return streamDone && buffer.length > 0 ? buffer.length : -1;
}

export const CADENCE = {
  /** Comfortable reading rhythm while text is still arriving. */
  base: 55,
  /** Floor when the buffer has run ahead of the display. */
  fast: 18,
  /** Everything queued when the stream closes is shown within this long. */
  drainMs: 600,
  /** Show the first block by now even if no boundary has arrived, to protect TTFT. */
  firstBlockMs: 250,
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

