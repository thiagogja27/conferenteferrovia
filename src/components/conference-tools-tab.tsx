import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Clipboard, Download, Eraser, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AnalysisMode = 'missing-in-b' | 'missing-in-a' | 'duplicates' | 'common' | 'invalid'
type ResultRow = { key: string; detail: string }

function parseKeys(input: string): string[] {
  return input
    .split(/[\n\r\t;,]+/)
    .map((value) => value.replace(/\D/g, ''))
    .filter(Boolean)
}

function isValidAccessKey(key: string): boolean {
  if (!/^\d{44}$/.test(key)) return false

  let sum = 0
  let weight = 2
  for (let index = 42; index >= 0; index -= 1) {
    sum += Number(key[index]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }

  const remainder = sum % 11
  const checkDigit = remainder < 2 ? 0 : 11 - remainder
  return Number(key[43]) === checkDigit
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function ConferenceToolsTab() {
  const [listAInput, setListAInput] = useState('')
  const [listBInput, setListBInput] = useState('')
  const [mode, setMode] = useState<AnalysisMode>('missing-in-b')
  const [notice, setNotice] = useState('')

  const listA = useMemo(() => parseKeys(listAInput), [listAInput])
  const listB = useMemo(() => parseKeys(listBInput), [listBInput])
  const rows = useMemo<ResultRow[]>(() => {
    const setA = new Set(listA)
    const setB = new Set(listB)

    switch (mode) {
      case 'missing-in-b':
        return unique(listA)
          .filter((key) => !setB.has(key))
          .map((key) => ({ key, detail: 'Encontrada na Lista A, ausente na Lista B' }))
      case 'missing-in-a':
        return unique(listB)
          .filter((key) => !setA.has(key))
          .map((key) => ({ key, detail: 'Encontrada na Lista B, ausente na Lista A' }))
      case 'duplicates': {
        const counts = (values: string[]) => values.reduce<Map<string, number>>((result, key) => {
          result.set(key, (result.get(key) ?? 0) + 1)
          return result
        }, new Map())
        const countA = counts(listA)
        const countB = counts(listB)
        return unique([...listA, ...listB])
          .filter((key) => (countA.get(key) ?? 0) > 1 || (countB.get(key) ?? 0) > 1)
          .map((key) => ({
            key,
            detail: [
              (countA.get(key) ?? 0) > 1 ? `Lista A: ${countA.get(key)} ocorrências` : '',
              (countB.get(key) ?? 0) > 1 ? `Lista B: ${countB.get(key)} ocorrências` : '',
            ].filter(Boolean).join(' · '),
          }))
      }
      case 'common':
        return unique(listA)
          .filter((key) => setB.has(key))
          .map((key) => ({ key, detail: 'Presente nas duas listas' }))
      case 'invalid':
        return [
          ...listA.filter((key) => !isValidAccessKey(key)).map((key) => ({
            key,
            detail: key.length !== 44 ? `Tamanho incorreto (${key.length} dígitos)` : 'Dígito verificador inválido',
          })),
          ...listB.filter((key) => !isValidAccessKey(key)).map((key) => ({
            key,
            detail: key.length !== 44 ? `Tamanho incorreto (${key.length} dígitos)` : 'Dígito verificador inválido',
          })),
        ]
    }
  }, [listA, listB, mode])

  const titleByMode: Record<AnalysisMode, string> = {
    'missing-in-b': 'Chaves da Lista A que faltam na Lista B',
    'missing-in-a': 'Chaves da Lista B que faltam na Lista A',
    duplicates: 'Chaves repetidas nas listas',
    common: 'Chaves presentes nas duas listas',
    invalid: 'Chaves com formato ou dígito verificador inválido',
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rows.map(({ key }) => key).join('\n'))
      setNotice('Resultado copiado para a área de transferência.')
    } catch (error) {
      console.error('Não foi possível copiar o resultado:', error)
      setNotice('Não foi possível copiar. Verifique a permissão do navegador.')
    }
  }

  const handleDownload = () => {
    const csv = ['Chave,Conferência', ...rows.map(({ key, detail }) => `"${key}","${detail}"`)].join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'resultado-conferencia-chaves.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const clearInputs = () => {
    setListAInput('')
    setListBInput('')
    setNotice('')
  }

  const analysisOptions: Array<{ value: AnalysisMode; label: string }> = [
    { value: 'missing-in-b', label: 'Faltando na Lista B (A → B)' },
    { value: 'missing-in-a', label: 'Faltando na Lista A (B → A)' },
    { value: 'duplicates', label: 'Duplicadas nas listas' },
    { value: 'common', label: 'Presentes nas duas listas' },
    { value: 'invalid', label: 'Validar chave NF-e (44 dígitos)' },
  ]

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-indigo-200 dark:border-indigo-900">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/40 dark:to-zinc-950">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Ferramentas de conferência</CardTitle>
              <CardDescription className="mt-2">
                Cole duas listas de chaves para localizar faltantes, duplicadas, correspondências e validar chaves NF-e.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="flex items-center justify-between text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                <span>Lista A</span>
                <span className="text-xs font-normal text-zinc-500">{listA.length} chaves</span>
              </span>
              <textarea
                value={listAInput}
                onChange={(event) => setListAInput(event.target.value)}
                placeholder="Cole as chaves aqui, uma por linha ou separadas por tabulação"
                className="min-h-48 w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs leading-5 text-zinc-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-indigo-950"
                spellCheck={false}
              />
            </label>
            <label className="space-y-2">
              <span className="flex items-center justify-between text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                <span>Lista B</span>
                <span className="text-xs font-normal text-zinc-500">{listB.length} chaves</span>
              </span>
              <textarea
                value={listBInput}
                onChange={(event) => setListBInput(event.target.value)}
                placeholder="Cole a segunda lista para comparar"
                className="min-h-48 w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs leading-5 text-zinc-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-indigo-950"
                spellCheck={false}
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Aceita colagem do Excel e separadores por linha, tabulação, vírgula ou ponto e vírgula. Espaços e pontuação são ignorados.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Na Lista A', value: listA.length, color: 'text-indigo-700 dark:text-indigo-300' },
          { label: 'Na Lista B', value: listB.length, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Resultado', value: rows.length, color: rows.length ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300' },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{metric.label}</span>
              <strong className={`text-xl ${metric.color}`}>{metric.value}</strong>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Análise</CardTitle>
            <CardDescription className="mt-1">Escolha o tipo de conferência para aplicar às listas.</CardDescription>
          </div>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as AnalysisMode)}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            aria-label="Tipo de análise"
          >
            {analysisOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{titleByMode[mode]}</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!rows.length}>
                <Clipboard className="h-4 w-4" /> Copiar
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={!rows.length}>
                <Download className="h-4 w-4" /> Baixar CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={clearInputs} disabled={!listAInput && !listBInput}>
                <Eraser className="h-4 w-4" /> Limpar
              </Button>
            </div>
          </div>

          {notice && (
            <p role="status" className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{notice}</p>
          )}

          {rows.length ? (
            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Chave</th>
                    <th className="px-3 py-2 font-semibold">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map((row, index) => (
                    <tr key={`${row.key}-${index}`} className="text-zinc-700 dark:text-zinc-300">
                      <td className="break-all px-3 py-2 font-mono">{row.key}</td>
                      <td className="px-3 py-2">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
              {mode === 'invalid' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
              {listA.length || listB.length
                ? mode === 'invalid' ? 'Todas as chaves têm formato e dígito verificador válidos.' : 'Nenhuma divergência encontrada nesta análise.'
                : 'Cole suas listas acima para começar a conferência.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
