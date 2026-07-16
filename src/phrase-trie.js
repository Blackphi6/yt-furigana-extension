/**
 * 表層→読みの最長一致用 Trie。
 * NEologd 級の語彙（数十万）でも、位置ごとに全列挙せず O(語長) で探す。
 */

/**
 * @typedef {{ children: Map<string, object>, reading?: string, end?: boolean }} TrieNode
 */

/**
 * @param {Record<string, string> | Map<string, string> | Iterable<[string, string]>} phrases
 * @returns {TrieNode}
 */
export function buildPhraseTrie(phrases) {
  /** @type {TrieNode} */
  const root = { children: new Map() };
  const entries =
    phrases instanceof Map
      ? phrases.entries()
      : Array.isArray(phrases)
        ? phrases
        : Object.entries(phrases || {});

  for (const [surface, reading] of entries) {
    if (!surface || surface.length < 2 || !reading) continue;
    let node = root;
    for (const ch of surface) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map() };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.end = true;
    node.reading = reading;
  }
  return root;
}

/**
 * text[index] から始まる最長一致。
 * @param {TrieNode} trie
 * @param {string} text
 * @param {number} index
 * @returns {{ surface: string, reading: string } | null}
 */
export function findLongestPhraseAt(trie, text, index) {
  if (!trie || !text || index < 0 || index >= text.length) return null;
  let node = trie;
  let best = null;
  let surface = "";

  for (let i = index; i < text.length; i += 1) {
    const next = node.children.get(text[i]);
    if (!next) break;
    node = next;
    surface += text[i];
    if (node.end && node.reading) {
      best = { surface, reading: node.reading };
    }
  }
  return best;
}
