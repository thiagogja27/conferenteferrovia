interface NFeAccessKeySource {
  nfeData?: { chaveAcesso?: string | null } | null
  parsedData?: { chave?: string | null } | null
}

export function deduplicateNfesByAccessKey<T extends NFeAccessKeySource>(items: T[]): T[] {
  const seenKeys = new Set<string>()

  return items.filter((item) => {
    const key = (item.nfeData?.chaveAcesso || item.parsedData?.chave || '').replace(/\D/g, '')
    if (key.length !== 44) return true
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
}
