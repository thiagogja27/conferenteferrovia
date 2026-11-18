import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  X,
  Calendar,
  Clock,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  Folder,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PlanilhaDigitacaoRow,
  LoadedNoteSummary,
  applyDigitacaoInputsToRows,
  buildCfopMapFromExistingNotes,
  exportPlanilhaDigitacaoExcel,
  normalizeChaveAcesso,
  parseNotesForCfop,
} from '@/lib/planilha-digitacao-export'

interface PlanilhaDigitacaoModalProps {
  open: boolean
  onClose: () => void
  rows: PlanilhaDigitacaoRow[]
  baseFileName: string
  sourceLabel: string
  loadedNotes?: any[]
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error') => void
}

function getTodayFormatted(): string {
  const now = new Date()
  const d = String(now.getDate()).padStart(2, '0')
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const y = now.getFullYear()
  return `${d}/${m}/${y}`
}

function getCurrentTimeFormatted(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = []

  const isAcceptedType = (cleanName: string) => {
    return cleanName.endsWith('.xml') || cleanName.endsWith('.pdf') || cleanName.endsWith('.zip')
  }

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const traverseEntry = async (entry: any): Promise<void> => {
      if (!entry) return
      if (entry.isFile) {
        const entryName = (entry.name || entry.fullPath || '').toLowerCase()
        const cleanName = entryName.split('/').pop() || entryName
        if (
          cleanName.startsWith('.') ||
          cleanName.includes('__macosx') ||
          cleanName.endsWith('.ds_store') ||
          cleanName.endsWith('thumbs.db') ||
          cleanName.endsWith('.tmp')
        ) {
          return
        }
        if (!isAcceptedType(cleanName)) return

        await new Promise<void>((resolve) => {
          entry.file(
            (file: File) => {
              if (entry.fullPath) {
                const cleanFullPath = entry.fullPath.replace(/^\//, '')
                try {
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: cleanFullPath,
                    writable: true,
                  })
                } catch {}
                ;(file as any).originalPath = cleanFullPath
                ;(file as any).filePath = cleanFullPath
              }
              files.push(file)
              resolve()
            },
            () => resolve()
          )
        })
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader()
        const readBatch = (): Promise<any[]> => {
          return new Promise((resolve) => {
            dirReader.readEntries(
              (entries: any[]) => resolve(entries || []),
              () => resolve([])
            )
          })
        }

        let batch: any[]
        do {
          batch = await readBatch()
          for (const childEntry of batch) {
            await traverseEntry(childEntry)
          }
        } while (batch.length > 0)
      }
    }

    const promises: Promise<void>[] = []
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i]
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
          promises.push(traverseEntry(entry))
        } else {
          const file = item.getAsFile()
          if (file && isAcceptedType(file.name.toLowerCase())) {
            files.push(file)
          }
        }
      }
    }
    await Promise.all(promises)
  }

  if (files.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files).filter((file) =>
      isAcceptedType(file.name.toLowerCase())
    )
  }

  return files
}

export const PlanilhaDigitacaoModal: React.FC<PlanilhaDigitacaoModalProps> = ({
  open,
  onClose,
  rows,
  baseFileName,
  sourceLabel,
  loadedNotes = [],
  onNotify,
}) => {
  const [dataDigitacao, setDataDigitacao] = useState('')
  const [horaDigitacao, setHoraDigitacao] = useState('')
  const [uploadedNotes, setUploadedNotes] = useState<LoadedNoteSummary[]>([])
  const [isParsingNotes, setIsParsingNotes] = useState(false)
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number; fileName: string } | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [modalError, setModalError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Inicializar Data/Hora ao abrir
  useEffect(() => {
    if (open) {
      setDataDigitacao((prev) => prev || getTodayFormatted())
      setHoraDigitacao((prev) => prev || getCurrentTimeFormatted())
    }
  }, [open])

  // Fechar com ESC
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Mapa unificado: notas já carregadas na aba principal + notas inseridas no modal
  const { cfopByChave, preloadedCount } = useMemo(() => {
    const map = buildCfopMapFromExistingNotes(loadedNotes)
    const initialSize = map.size

    for (const item of uploadedNotes) {
      if (item.chave && item.cfop) {
        map.set(item.chave, item.cfop)
      }
    }

    return {
      cfopByChave: map,
      preloadedCount: initialSize,
    }
  }, [loadedNotes, uploadedNotes])

  // Prévia das linhas enriquecidas com Data, Hora e CFOP cruzado por Chave de Acesso
  const enrichedRows = useMemo(() => {
    return applyDigitacaoInputsToRows(rows, {
      dataDigitacao,
      horaDigitacao,
      cfopByChave,
    })
  }, [rows, dataDigitacao, horaDigitacao, cfopByChave])

  const matchStats = useMemo(() => {
    let withChave = 0
    let matchedCfop = 0
    for (const r of enrichedRows) {
      const cleanKey = normalizeChaveAcesso(r.chaveNf)
      if (cleanKey.length === 44) withChave++
      if (r.cfop) matchedCfop++
    }
    return {
      total: enrichedRows.length,
      withChave,
      matchedCfop,
      missingCfop: Math.max(0, enrichedRows.length - matchedCfop),
    }
  }, [enrichedRows])

  const handleFilesSelected = async (fileList: FileList | File[] | null) => {
    if (!fileList) return
    const filesArr = Array.from(fileList).filter((f) => {
      const lower = (f.name || '').toLowerCase()
      if (
        lower.startsWith('.') ||
        lower.endsWith('.ds_store') ||
        lower.endsWith('thumbs.db') ||
        lower.endsWith('.tmp')
      ) {
        return false
      }
      return lower.endsWith('.xml') || lower.endsWith('.pdf') || lower.endsWith('.zip')
    })

    if (filesArr.length === 0) {
      const msg = 'Nenhum arquivo XML, PDF ou ZIP válido encontrado na seleção.'
      setParseErrors([msg])
      onNotify?.(msg, 'warning')
      return
    }

    setIsParsingNotes(true)
    setParseErrors([])
    setProgressInfo({ current: 0, total: filesArr.length, fileName: '' })

    try {
      const { entries, errors } = await parseNotesForCfop(filesArr, (current, total, fileName) => {
        setProgressInfo({ current, total, fileName })
      })

      setUploadedNotes((prev) => {
        const merged = new Map<string, LoadedNoteSummary>()
        for (const item of prev) {
          if (item.chave) merged.set(item.chave, item)
        }
        for (const item of entries) {
          if (item.chave) merged.set(item.chave, item)
        }
        return Array.from(merged.values())
      })

      if (errors.length > 0) {
        setParseErrors(errors.slice(0, 10))
      }

      const withCfopCount = entries.filter((e) => e.cfop).length
      onNotify?.(
        `${entries.length} nota(s) processada(s) (${withCfopCount} com CFOP extraído).`,
        entries.length > 0 ? 'success' : 'warning'
      )
    } catch (err: any) {
      console.error('Erro ao ler notas para CFOP:', err)
      onNotify?.(`Erro ao processar notas: ${err?.message || 'falha inesperada'}`, 'error')
    } finally {
      setIsParsingNotes(false)
      setProgressInfo(null)
    }
  }

  const handleExport = () => {
    if (!dataDigitacao.trim() || !horaDigitacao.trim()) {
      const msg = 'Informe a Data e a Hora da digitação antes de gerar a planilha.'
      setModalError(msg)
      onNotify?.(msg, 'warning')
      return
    }
    setModalError(null)

    const fileName = exportPlanilhaDigitacaoExcel(enrichedRows, baseFileName)
    onNotify?.(
      `Planilha de Digitação "${fileName}" gerada com ${enrichedRows.length} linha(s) e ${matchStats.matchedCfop} CFOP(s) preenchido(s)!`,
      'success'
    )
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Formalizar Planilha de Digitação — {sourceLabel}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Informe a data e hora da digitação e insira as notas fiscais para preencher o CFOP via Chave de Acesso.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Etapa 1: Data e Hora da Digitação */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                1. Data e Hora da Digitação
              </span>
              <button
                type="button"
                onClick={() => {
                  setDataDigitacao(getTodayFormatted())
                  setHoraDigitacao(getCurrentTimeFormatted())
                }}
                className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Usar Data/Hora Atual
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-sky-600" />
                  Data da Digitação (DD/MM/AAAA)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 17/11/2026"
                  value={dataDigitacao}
                  onChange={(e) => {
                    setDataDigitacao(e.target.value)
                    if (modalError) setModalError(null)
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-sky-600" />
                  Hora da Digitação (HH:mm)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 16:20"
                  value={horaDigitacao}
                  onChange={(e) => {
                    setHoraDigitacao(e.target.value)
                    if (modalError) setModalError(null)
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {modalError}
              </div>
            )}
          </div>

          {/* Etapa 2: Inserir Notas para extração do CFOP */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                2. Inserir Notas Fiscais (para identificar o CFOP por Chave de Acesso)
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                {preloadedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
                    {preloadedCount} nota(s) já no sistema
                  </span>
                )}
                {uploadedNotes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedNotes([])
                      setParseErrors([])
                    }}
                    className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Limpar notas ({uploadedNotes.length})
                  </button>
                )}
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault()
                setIsDragOver(false)
                if (e.dataTransfer) {
                  const extracted = await extractFilesFromDataTransfer(e.dataTransfer)
                  await handleFilesSelected(extracted)
                }
              }}
              className={`p-5 rounded-xl border-2 border-dashed text-center transition-all ${
                isDragOver
                  ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30'
                  : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-sky-400'
              }`}
            >
              <input
                ref={filesInputRef}
                type="file"
                multiple
                accept=".xml,.pdf,.zip"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files ? Array.from(e.target.files) : []
                  e.target.value = ''
                  if (selected.length > 0) handleFilesSelected(selected)
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files ? Array.from(e.target.files) : []
                  e.target.value = ''
                  if (selected.length > 0) handleFilesSelected(selected)
                }}
                {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
              />

              <div className="flex flex-col items-center gap-2">
                {isParsingNotes ? (
                  <>
                    <RefreshCw className="h-7 w-7 text-sky-600 animate-spin" />
                    <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                      Lendo notas e extraindo CFOPs ({progressInfo?.current || 0}/{progressInfo?.total || 0})...
                    </p>
                    {progressInfo?.fileName && (
                      <span className="text-[11px] font-mono text-zinc-500 truncate max-w-md">
                        {progressInfo.fileName}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Upload className="h-7 w-7 text-sky-600 dark:text-sky-400" />
                    <div className="text-xs font-bold text-foreground">
                      Arraste arquivos XML, PDF (DANFE), ZIP ou pastas das notas aqui
                    </div>
                    <p className="text-[11px] text-zinc-500 max-w-md">
                      O sistema comparará as chaves de acesso das notas com o resumo para preencher automaticamente o <strong>CFOP</strong> de cada item.
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => filesInputRef.current?.click()}
                        className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-8 gap-1.5 cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Selecionar Notas (XML / PDF / ZIP)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => folderInputRef.current?.click()}
                        className="text-xs h-8 gap-1.5 cursor-pointer border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold"
                      >
                        <Folder className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        Selecionar Pasta(s) de Vagões
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {parseErrors.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                {parseErrors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>

          {/* Etapa 3: Resumo de Cruzamento Chave -> CFOP + Prévia */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">
                  Registros do Resumo
                </span>
                <span className="text-lg font-extrabold text-foreground">
                  {matchStats.total}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  CFOP Localizado
                </span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                  {matchStats.matchedCfop}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
                <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Sem Nota / Pendente
                </span>
                <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
                  {matchStats.missingCfop}
                </span>
              </div>
            </div>

            {/* Prévia compacta */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden max-h-48 overflow-y-auto">
              <table className="min-w-full text-[11px] divide-y divide-zinc-200 dark:divide-zinc-800">
                <thead className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 font-bold uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="px-2.5 py-2 text-left">Vagão</th>
                    <th className="px-2.5 py-2 text-left">NFe</th>
                    <th className="px-2.5 py-2 text-left">Chave NF</th>
                    <th className="px-2.5 py-2 text-center">CFOP</th>
                    <th className="px-2.5 py-2 text-center">Data</th>
                    <th className="px-2.5 py-2 text-center">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                  {enrichedRows.slice(0, 50).map((r, idx) => (
                    <tr key={idx} className="bg-white dark:bg-zinc-900">
                      <td className="px-2.5 py-1.5 font-bold whitespace-nowrap">{r.vagao || '-'}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">{r.nfe || '-'}</td>
                      <td className="px-2.5 py-1.5 text-zinc-500 max-w-[200px] truncate" title={r.chaveNf}>
                        {r.chaveNf || '-'}
                      </td>
                      <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                        {r.cfop ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                            {r.cfop}
                          </span>
                        ) : (
                          <span className="text-amber-500">-</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-center whitespace-nowrap">{r.data || '-'}</td>
                      <td className="px-2.5 py-1.5 text-center whitespace-nowrap">{r.hora || '-'}</td>
                    </tr>
                  ))}
                  {enrichedRows.length > 50 && (
                    <tr>
                      <td colSpan={6} className="px-2.5 py-1.5 text-center text-zinc-500 font-sans">
                        ... e mais {enrichedRows.length - 50} linha(s) na exportação Excel completa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60">
          <span className="text-[11px] text-zinc-500 hidden sm:inline">
            Colunas: Vagão, Bruto, NFe, Data NFe, Rateio, Chave NF, Mercadoria, Fornecedor, Operação, CNPJ Dest., Data, Hora, CFOP
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-9 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isParsingNotes}
              onClick={handleExport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 gap-1.5 font-bold cursor-pointer shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Gerar Planilha (.xlsx)
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
