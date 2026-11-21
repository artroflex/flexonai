/** Interleave news categories so a busy category cannot crowd out the whole context. */
export function mergeNewsPools<T extends { link: string }>(pools: T[][], limit = 30): T[] {
  const merged: T[] = []
  const seen = new Set<string>()
  const depth = Math.max(0, ...pools.map(pool => pool.length))
  for (let i = 0; i < depth; i++) {
    for (const pool of pools) {
      const article = pool[i]
      if (!article || seen.has(article.link)) continue
      seen.add(article.link); merged.push(article)
      if (merged.length >= limit) return merged
    }
  }
  return merged
}
