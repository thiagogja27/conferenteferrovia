export type GuarujaTerminalCode = 'TEAG' | 'TEG'

export function getExplicitGuarujaTerminalCode(text: string): GuarujaTerminalCode | null {
  if (/\bTEAG\b/i.test(text)) return 'TEAG'
  if (/\bTEG\b/i.test(text)) return 'TEG'
  return null
}
