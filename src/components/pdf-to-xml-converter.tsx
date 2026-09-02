'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { parseNFE, verifyChaveCNPJ, type NFEData } from '@/lib/nfe-parser'
import { parsePdfClientSide } from '@/lib/client-pdf-parser'
import { generatePDF } from '@/lib/pdf-generator'
import { Dashboard } from '@/components/dashboard'
import {
  FileText,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  FileCode,
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  Search,
  Check,
  Copy,
  FileCheck,
  XCircle,
  FileQuestion,
  FileCheck2,
  Folder,
  Volume2,
  VolumeX,
  Volume1,
  AlertTriangle,
  Scale,
  BookOpen,
  Bot,
  BrainCircuit,
  Zap,
  CheckCheck,
} from 'lucide-react'
import {
  auditarDivergenciasComIA,
  type WeightAuditItemInput,
  type WeightAuditItemResult,
  type WeightAuditResponse,
} from '@/lib/weight-ai-auditor'

async function getAllFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = []

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
        if (!cleanName.endsWith('.pdf') && !cleanName.endsWith('.xml') && !cleanName.endsWith('.zip')) {
          return
        }

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
                } catch (e) {}
                ;(file as any).originalPath = cleanFullPath
                ;(file as any).filePath = cleanFullPath
              }
              files.push(file)
              resolve()
            },
            (err: any) => {
              console.warn('Erro ao ler entrada de arquivo:', err)
              resolve()
            }
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
          if (file) {
            const lower = file.name.toLowerCase()
            if (lower.endsWith('.pdf') || lower.endsWith('.xml') || lower.endsWith('.zip')) {
              files.push(file)
            }
          }
        }
      }
    }
    await Promise.all(promises)
  }

  if (files.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files).filter((file) => {
      const lower = file.name.toLowerCase()
      return lower.endsWith('.pdf') || lower.endsWith('.xml') || lower.endsWith('.zip')
    })
  }

  return files
}
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { findKeysInText, isValidNFeKey } from '@/lib/pdf-text-parser'

interface PDFConversionResult {
  fileName: string
  filePath?: string
  originalPath?: string
  fileType?: 'pdf' | 'xml'
  xmlContent: string | null
  error: string | null
  isProcessing: boolean
  parsedData?: any
  nfeData?: NFEData | null
}

interface ExcelMatchInfo {
  row: number
  rawValue: string
  sheetName: string
  pesoSelecionado?: number | null
  pesoSelecionadoStr?: string
  pesoNotaVagao?: number | null
  pesoNotaVagaoStr?: string
  tara?: number | null
  taraStr?: string
  vagao?: string
  pesoBruto?: number | null
  pesoBrutoStr?: string
}

export interface WagonSummary {
  vagao: string
  sheetName: string
  qtdNotas: number
  somaPesoNotaVagao: number
  somaPesoNotaVagaoStr: string
  tara: number
  taraStr: string
  pesoBrutoTotal: number
  pesoBrutoTotalStr: string
  linhas: string
}

export interface ExcelRowRecord {
  id: string
  sheetName: string
  row: number
  key?: string
  vagao?: string
  pesoSelecionado?: number | null
  pesoSelecionadoStr?: string
  pesoNotaVagao?: number | null
  pesoNotaVagaoStr?: string
  tara?: number | null
  taraStr?: string
  pesoBruto?: number | null
  pesoBrutoStr?: string
  rawValue?: string
  hasData?: boolean
}

interface ExcelData {
  fileName: string
  totalRows: number
  keysMap: Map<string, ExcelMatchInfo>
  allKeysList: string[]
  allRowsList: ExcelRowRecord[]
  sheets: string[]
  wagonSummaries?: WagonSummary[]
}

export function confrontWeights(
  matchInfo: ExcelMatchInfo | null | undefined,
  qtdNota: number
) {
  const pesoNotaVagaoStr = matchInfo?.pesoNotaVagaoStr || 'N/A'
  const taraStr = matchInfo?.taraStr || 'N/A'
  const vagao = matchInfo?.vagao || ''
  const pesoBrutoStr = matchInfo?.pesoBrutoStr || 'N/A'

  if (!matchInfo || matchInfo.pesoSelecionado === undefined || matchInfo.pesoSelecionado === null) {
    return {
      pesoExcel: null as number | null,
      pesoExcelStr: 'N/A',
      pesoNotaVagaoStr,
      taraStr,
      vagao,
      pesoBrutoStr,
      qtdNota,
      diferenca: 0,
      status: 'SEM_PESO_EXCEL' as const,
      statusLabel: 'S/ PESO EXCEL',
      detalhes: 'Coluna "Peso Selecionado" não encontrada ou sem valor no Excel',
    }
  }

  const pesoExcel = matchInfo.pesoSelecionado
  const pesoExcelStr = matchInfo.pesoSelecionadoStr || String(pesoExcel)

  let diff = Math.abs(pesoExcel - qtdNota)
  let isEquivalentUnit = false

  // Checar equivalência de unidades (TON vs KG, ex: 47,76 TON vs 47760 KG)
  if (diff > 0.01) {
    if (Math.abs(pesoExcel * 1000 - qtdNota) < 1) {
      isEquivalentUnit = true
      diff = 0
    } else if (Math.abs(pesoExcel - qtdNota * 1000) < 1) {
      isEquivalentUnit = true
      diff = 0
    }
  }

  if (diff <= 0.01) {
    return {
      pesoExcel,
      pesoExcelStr,
      pesoNotaVagaoStr,
      taraStr,
      vagao,
      pesoBrutoStr,
      qtdNota,
      diferenca: 0,
      status: 'CONFERE' as const,
      statusLabel: 'PESO CONFERE',
      detalhes: isEquivalentUnit
        ? `Valores equivalentes (Excel: ${pesoExcelStr} | Nota: ${qtdNota})`
        : `Valores batem (Excel: ${pesoExcelStr} | Nota: ${qtdNota})`,
    }
  }

  const diferencaReal = pesoExcel - qtdNota
  return {
    pesoExcel,
    pesoExcelStr,
    pesoNotaVagaoStr,
    taraStr,
    vagao,
    pesoBrutoStr,
    qtdNota,
    diferenca: diferencaReal,
    status: 'DIVERGENTE' as const,
    statusLabel: `DIVERGÊNCIA (${diferencaReal > 0 ? '+' : ''}${diferencaReal.toLocaleString('pt-BR', { maximumFractionDigits: 3 })})`,
    detalhes: `Excel (${pesoExcelStr}) ≠ Nota (${qtdNota.toLocaleString('pt-BR')}) | Dif: ${diferencaReal.toLocaleString('pt-BR')}`,
  }
}

interface PDFToXMLConverterProps {
  onAnalyzeXML: (fileName: string, xmlContent: string) => void
  onOpenDocumentation?: () => void
}

export function PDFToXMLConverter({ onAnalyzeXML, onOpenDocumentation }: PDFToXMLConverterProps) {
  const [subMode, setSubMode] = useState<'pdf-to-xml' | 'xml-to-pdf'>('pdf-to-xml')
  const [results, setResults] = useState<PDFConversionResult[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessingAll, setIsProcessingAll] = useState(false)
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null)

  // Estados para a funcionalidade de conferência de chaves com planilha Excel
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [excelFileName, setExcelFileName] = useState<string>('')
  const [availableExcelColumns, setAvailableExcelColumns] = useState<string[]>([])
  const [selectedExcelWeightCol, setSelectedExcelWeightCol] = useState<string>('auto')
  const [isExcelLoading, setIsExcelLoading] = useState<boolean>(false)
  const [excelFilter, setExcelFilter] = useState<'all' | 'matched' | 'unmatched' | 'excel_only' | 'weight_divergent'>('all')
  const [excelSearchQuery, setExcelSearchQuery] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Estados da IA Auditora de Divergências de Peso (Conferência de Todas as Notas e Localização do Valor Real)
  const [auditResultsMap, setAuditResultsMap] = useState<Record<string, WeightAuditItemResult>>({})
  const [isAuditingAllWeights, setIsAuditingAllWeights] = useState(false)
  const [auditingKey, setAuditingKey] = useState<string | null>(null)
  const [auditSummary, setAuditSummary] = useState<WeightAuditResponse | null>(null)
  const [overrideWeightsMap, setOverrideWeightsMap] = useState<Record<string, number>>({})

  // Estados e funções para Alerta de Voz (Web Speech API)
  const [voiceAlertEnabled, setVoiceAlertEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nfe_voice_alert_enabled')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })

  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'pt-BR'
      utterance.rate = 1.0
      utterance.pitch = 1.0

      const voices = window.speechSynthesis.getVoices()
      const ptVoice = voices.find((v) => v.lang.startsWith('pt'))
      if (ptVoice) {
        utterance.voice = ptVoice
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('Erro na síntese de voz:', err)
    }
  }, [])

  const toggleVoiceAlert = (enabled: boolean) => {
    setVoiceAlertEnabled(enabled)
    if (typeof window !== 'undefined') {
      localStorage.setItem('nfe_voice_alert_enabled', String(enabled))
    }
    if (enabled) {
      speakText('Alerta por voz ativado. O sistema avisará quando houver divergência entre o CNPJ da Chave e o Destinatário.')
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }

  const checkAndSpeakDivergences = useCallback(
    (itemsList: PDFConversionResult[]) => {
      if (!voiceAlertEnabled) return

      const divergentItems = itemsList.filter((res) => {
        const d = res.parsedData
        const key = d?.chave || res.nfeData?.chaveAcesso || ''
        const emitCNPJ = d?.emitCNPJ || res.nfeData?.emitente?.cnpj || ''
        const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
        if (!key) return false
        const v = verifyChaveCNPJ(key, emitCNPJ, destCNPJ)
        return v.confrontoChaveXDest === 'DIVERGENTES'
      })

      if (divergentItems.length === 1) {
        const item = divergentItems[0]
        const docNum = item.parsedData?.nNF
          ? `nota fiscal número ${item.parsedData.nNF}`
          : `arquivo ${item.fileName}`
        speakText(
          `Atenção! CNPJ da Chave de Acesso é divergente do Destinatário na ${docNum}.`
        )
      } else if (divergentItems.length > 1) {
        speakText(
          `Atenção! Foram encontradas ${divergentItems.length} notas fiscais com CNPJ da Chave de Acesso divergente do Destinatário.`
        )
      }
    },
    [voiceAlertEnabled, speakText]
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // Função auxiliar para converter arquivos para Base64 de forma assíncrona
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64String = reader.result as string
        const cleanBase64 = base64String.split(',')[1]
        resolve(cleanBase64)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  // =========================================================================
  // MODO 1: CONVERTER PDF PARA XML
  // =========================================================================
  const convertSinglePDF = async (file: File): Promise<PDFConversionResult[]> => {
    let apiSuccess = false
    let data: any = null

    try {
      const base64Data = await fileToBase64(file)
      const response = await fetch('/api/pdf-to-xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: file.name,
        }),
      })

      if (response.ok) {
        const responseText = await response.text()
        try {
          data = JSON.parse(responseText)
          if (data && (data.xml || (data.items && data.items.length > 0))) {
            apiSuccess = true
          }
        } catch (parseErr) {
          try {
            const cleanedText = responseText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            data = JSON.parse(cleanedText)
            if (data && (data.xml || (data.items && data.items.length > 0))) {
              apiSuccess = true
            }
          } catch (retryErr) {
            // Ignora falha de parse do servidor e usa fallback do cliente
          }
        }
      }
    } catch (apiErr) {
      // Servidor inacessível, cai no processamento direto no navegador
    }

    const fileOrigPath = (file as any).originalPath || (file as any).filePath || file.webkitRelativePath || file.name

    if (apiSuccess && data) {
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        return data.items.map((it: any) => {
          let nfeData: any = null
          if (it.xml) {
            try {
              nfeData = parseNFE(it.xml)
            } catch (e) {}
          }
          return {
            fileName: it.fileName || file.name,
            filePath: fileOrigPath,
            originalPath: fileOrigPath,
            fileType: 'pdf' as const,
            xmlContent: it.xml,
            error: null,
            isProcessing: false,
            parsedData: it.parsedData,
            nfeData,
          }
        })
      }

      let nfeData: any = null
      if (data.xml) {
        try {
          nfeData = parseNFE(data.xml)
        } catch (e) {}
      }

      return [{
        fileName: file.name,
        filePath: fileOrigPath,
        originalPath: fileOrigPath,
        fileType: 'pdf' as const,
        xmlContent: data.xml,
        error: null,
        isProcessing: false,
        parsedData: data.parsedData,
        nfeData,
      }]
    }

    // Fallback 100% no navegador (Client-Side) com pdfjs-dist
    try {
      const clientResult = await parsePdfClientSide(file, file.name)
      if (clientResult.items && clientResult.items.length > 0) {
        return clientResult.items.map((it: any) => ({
          fileName: it.fileName || file.name,
          filePath: fileOrigPath,
          originalPath: fileOrigPath,
          fileType: 'pdf' as const,
          xmlContent: it.xml,
          error: null,
          isProcessing: false,
          parsedData: it.parsedData,
          nfeData: it.nfeData,
        }))
      }

      return [{
        fileName: file.name,
        filePath: fileOrigPath,
        originalPath: fileOrigPath,
        fileType: 'pdf' as const,
        xmlContent: clientResult.xml,
        error: null,
        isProcessing: false,
        parsedData: clientResult.parsedData,
        nfeData: clientResult.nfeData,
      }]
    } catch (clientErr: any) {
      console.error(`Erro ao converter ${file.name} no cliente:`, clientErr)
      return [{
        fileName: file.name,
        filePath: fileOrigPath,
        originalPath: fileOrigPath,
        fileType: 'pdf' as const,
        xmlContent: null,
        error: clientErr.message || 'Não foi possível ler o arquivo PDF.',
        isProcessing: false,
      }]
    }
  }

  const processPDFs = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles)
    // Filtrar apenas arquivos .pdf e .zip válidos, ignorando qualquer outro tipo de arquivo (imagens, excel, doc, etc.)
    const validSelection = fileArray.filter(f => {
      const l = f.name.toLowerCase()
      return (l.endsWith('.pdf') || l.endsWith('.zip')) && !l.startsWith('.') && !l.includes('__macosx')
    })

    if (validSelection.length === 0) {
      alert('Nenhum arquivo PDF (.pdf) ou pacote (.zip) encontrado na seleção/pasta.')
      return
    }

    setIsProcessingAll(true)
    setProcessingProgress({ current: 0, total: 0 })

    const pdfFiles: File[] = []

    for (const file of validSelection) {
      const lowerName = file.name.toLowerCase()
      if (lowerName.endsWith('.zip')) {
        try {
          const zip = new JSZip()
          const zipContents = await zip.loadAsync(file)
          for (const [relativePath, zipEntry] of Object.entries(zipContents.files)) {
            if (!zipEntry.dir && !relativePath.includes('__MACOSX') && !relativePath.startsWith('.')) {
              const cleanName = relativePath.split('/').pop() || relativePath
              if (cleanName.toLowerCase().endsWith('.pdf')) {
                const blob = await zipEntry.async('blob')
                const pdfFile = new File([blob], cleanName, { type: 'application/pdf' })
                ;(pdfFile as any).originalPath = relativePath
                ;(pdfFile as any).filePath = relativePath
                try {
                  Object.defineProperty(pdfFile, 'webkitRelativePath', {
                    value: relativePath,
                    writable: true,
                  })
                } catch (e) {}
                pdfFiles.push(pdfFile)
              }
            }
          }
        } catch (zipErr) {
          console.error('Erro ao ler arquivo ZIP de PDFs:', zipErr)
        }
      } else if (lowerName.endsWith('.pdf')) {
        pdfFiles.push(file)
      }
    }

    if (pdfFiles.length === 0) {
      setIsProcessingAll(false)
      setProcessingProgress(null)
      alert('Nenhum arquivo PDF (.pdf) válido encontrado nos arquivos ou pastas selecionados.')
      return
    }

    setProcessingProgress({ current: 0, total: pdfFiles.length })

    const initialResults: PDFConversionResult[] = pdfFiles.map(file => ({
      fileName: file.name,
      fileType: 'pdf',
      xmlContent: null,
      error: null,
      isProcessing: true,
    }))

    setResults(initialResults)

    const CONCURRENCY_LIMIT = 3
    const resultsMap = new Map<number, PDFConversionResult[]>()
    let completedCount = 0

    const queue = pdfFiles.map((file, idx) => ({ file, idx }))

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) break
        const resList = await convertSinglePDF(item.file)
        resultsMap.set(item.idx, resList)
        completedCount++

        const currentResults: PDFConversionResult[] = []
        for (let i = 0; i < pdfFiles.length; i++) {
          if (resultsMap.has(i)) {
            currentResults.push(...resultsMap.get(i)!)
          } else {
            currentResults.push(initialResults[i])
          }
        }
        setResults([...currentResults])
        setProcessingProgress({ current: completedCount, total: pdfFiles.length })
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, pdfFiles.length) }, worker))

    const finalResults: PDFConversionResult[] = []
    for (let i = 0; i < pdfFiles.length; i++) {
      if (resultsMap.has(i)) {
        finalResults.push(...resultsMap.get(i)!)
      }
    }

    setResults(finalResults)
    setIsProcessingAll(false)
    setProcessingProgress(null)
    checkAndSpeakDivergences(finalResults)
  }, [checkAndSpeakDivergences])

  // =========================================================================
  // MODO 2: CONVERTER XML PARA PDF (DANFE) E CONFERIR CHAVES
  // =========================================================================
  const processXMLs = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles)
    // Filtrar estritamente apenas .xml, .pdf e .zip, ignorando qualquer outro arquivo sem tentar lê-lo
    const validFiles = fileArray.filter(f => {
      const l = f.name.toLowerCase()
      return (l.endsWith('.xml') || l.endsWith('.zip') || l.endsWith('.pdf')) && !l.startsWith('.') && !l.includes('__macosx')
    })

    if (validFiles.length === 0) {
      alert('Nenhum arquivo .XML, .PDF ou .ZIP de notas fiscais encontrado na seleção/pasta.')
      return
    }

    setIsProcessingAll(true)
    setProcessingProgress({ current: 0, total: 0 })

    interface RawItem {
      fileName: string
      filePath?: string
      originalPath?: string
      fileType: 'xml' | 'pdf'
      contentOrBlob: File | Blob | string
    }

    const rawItems: RawItem[] = []

    for (const file of validFiles) {
      const lowerName = file.name.toLowerCase()
      const origPath = (file as any).originalPath || (file as any).filePath || file.webkitRelativePath || file.name
      if (lowerName.endsWith('.zip')) {
        try {
          const zip = new JSZip()
          const zipContents = await zip.loadAsync(file)
          for (const [relativePath, zipEntry] of Object.entries(zipContents.files)) {
            if (!zipEntry.dir && !relativePath.includes('__MACOSX') && !relativePath.startsWith('.')) {
              const cleanName = relativePath.split('/').pop() || relativePath
              const entryLower = cleanName.toLowerCase()
              if (entryLower.endsWith('.xml')) {
                const xmlText = await zipEntry.async('string')
                rawItems.push({ fileName: cleanName, filePath: relativePath, originalPath: relativePath, fileType: 'xml', contentOrBlob: xmlText })
              } else if (entryLower.endsWith('.pdf')) {
                const blob = await zipEntry.async('blob')
                rawItems.push({ fileName: cleanName, filePath: relativePath, originalPath: relativePath, fileType: 'pdf', contentOrBlob: blob })
              }
            }
          }
        } catch (zipErr) {
          console.error('Erro ao processar arquivo ZIP:', zipErr)
        }
      } else if (lowerName.endsWith('.pdf')) {
        rawItems.push({ fileName: file.name, filePath: origPath, originalPath: origPath, fileType: 'pdf', contentOrBlob: file })
      } else if (lowerName.endsWith('.xml')) {
        const xmlText = await file.text()
        rawItems.push({ fileName: file.name, filePath: origPath, originalPath: origPath, fileType: 'xml', contentOrBlob: xmlText })
      }
      // Outros formatos são ignorados silenciosamente sem tentar ler como XML
    }

    if (rawItems.length === 0) {
      setIsProcessingAll(false)
      setProcessingProgress(null)
      alert('Nenhum arquivo .XML ou .PDF válido encontrado na seleção/pasta.')
      return
    }

    setProcessingProgress({ current: 0, total: rawItems.length })
    const initialResults: PDFConversionResult[] = rawItems.map(item => ({
      fileName: item.fileName,
      fileType: item.fileType,
      xmlContent: typeof item.contentOrBlob === 'string' ? item.contentOrBlob : null,
      error: null,
      isProcessing: true,
    }))

    setResults(initialResults)

    const CONCURRENCY_LIMIT = 6
    const resultsMap = new Map<number, PDFConversionResult[]>()
    let completedCount = 0

    const queue = rawItems.map((item, idx) => ({ item, idx }))

    const worker = async () => {
      while (queue.length > 0) {
        const queueItem = queue.shift()
        if (!queueItem) break
        const { item, idx } = queueItem
        let itemRes: PDFConversionResult[] = []

        if (item.fileType === 'pdf') {
          try {
            const pdfFile = item.contentOrBlob instanceof File
              ? item.contentOrBlob
              : new File([item.contentOrBlob as Blob], item.fileName, { type: 'application/pdf' })
            const itemPath = item.originalPath || item.filePath
            if (itemPath) {
              ;(pdfFile as any).originalPath = itemPath
              ;(pdfFile as any).filePath = itemPath
              try {
                Object.defineProperty(pdfFile, 'webkitRelativePath', {
                  value: itemPath,
                  writable: true,
                })
              } catch (e) {}
            }
            itemRes = await convertSinglePDF(pdfFile)
          } catch (err: any) {
            itemRes = [{
              fileName: item.fileName,
              fileType: 'pdf',
              xmlContent: null,
              error: 'Erro ao converter PDF',
              isProcessing: false,
            }]
          }
        } else {
          const xmlText = item.contentOrBlob as string
          try {
            const nfeData = parseNFE(xmlText)
            const totalQtd = nfeData.itens && nfeData.itens.length > 0
              ? nfeData.itens.reduce((sum, it) => sum + (Number(it.quantidade) || 0), 0)
              : (nfeData.transportador?.quantidade || 0)

            itemRes = [{
              fileName: item.fileName,
              filePath: item.filePath || item.originalPath,
              originalPath: item.originalPath || item.filePath,
              fileType: 'xml',
              xmlContent: xmlText,
              error: null,
              isProcessing: false,
              nfeData: nfeData,
              parsedData: {
                chave: nfeData.chaveAcesso,
                nNF: nfeData.numero,
                serie: nfeData.serie,
                emitNome: nfeData.emitente?.nome || '',
                emitCNPJ: nfeData.emitente?.cnpj || '',
                destNome: nfeData.destinatario?.nome || '',
                destCNPJ: nfeData.destinatario?.cpfCnpj || '',
                vNF: nfeData.impostos?.valorTotal || 0,
                quantidade: totalQtd,
                transpPesoL: nfeData.transportador?.pesoLiquido ? String(nfeData.transportador.pesoLiquido) : '',
              }
            }]
          } catch (err: any) {
            itemRes = [{
              fileName: item.fileName,
              fileType: 'xml',
              xmlContent: xmlText,
              error: 'Erro ao interpretar dados do arquivo XML',
              isProcessing: false,
            }]
          }
        }

        resultsMap.set(idx, itemRes)
        completedCount++

        const currentResults: PDFConversionResult[] = []
        for (let i = 0; i < rawItems.length; i++) {
          if (resultsMap.has(i)) {
            currentResults.push(...resultsMap.get(i)!)
          } else {
            currentResults.push(initialResults[i])
          }
        }
        setResults([...currentResults])
        setProcessingProgress({ current: completedCount, total: rawItems.length })
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, rawItems.length) }, worker))

    const finalResults: PDFConversionResult[] = []
    for (let i = 0; i < rawItems.length; i++) {
      if (resultsMap.has(i)) {
        finalResults.push(...resultsMap.get(i)!)
      }
    }

    setResults(finalResults)
    setIsProcessingAll(false)
    setProcessingProgress(null)
    checkAndSpeakDivergences(finalResults)
  }, [checkAndSpeakDivergences])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer) {
      const extractedFiles = await getAllFilesFromDataTransfer(e.dataTransfer)
      if (extractedFiles.length > 0) {
        if (subMode === 'pdf-to-xml') {
          processPDFs(extractedFiles)
        } else {
          processXMLs(extractedFiles)
        }
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (subMode === 'pdf-to-xml') {
        processPDFs(e.target.files)
      } else {
        processXMLs(e.target.files)
      }
      e.target.value = ''
    }
  }

  // =========================================================================
  // GERAÇÃO DE DANFE EM PDF (XML -> PDF)
  // =========================================================================
  const handleDownloadSinglePDF = async (result: PDFConversionResult) => {
    if (!result.nfeData) {
      alert('Dados da nota não disponíveis para geração do PDF DANFE.')
      return
    }

    try {
      const doc = generatePDF(result.nfeData)
      const baseName = result.fileName.replace(/\.xml$/i, '')
      const pdfFileName = `DANFE_NF_${result.nfeData.numero || baseName}_${Date.now()}.pdf`
      doc.save(pdfFileName)
    } catch (err) {
      console.error('Erro ao gerar PDF DANFE:', err)
      alert('Erro ao gerar PDF DANFE a partir da nota fiscal.')
    }
  }

  const handleDownloadAllPDFsZIP = async () => {
    const activeResults = results.filter(r => r.nfeData)
    if (activeResults.length === 0) {
      alert('Nenhuma nota válida disponível para exportar em PDF.')
      return
    }

    try {
      const zip = new JSZip()
      activeResults.forEach((res) => {
        if (res.nfeData) {
          const doc = generatePDF(res.nfeData)
          const pdfBlob = doc.output('blob')
          const pdfName = `DANFE_NF_${res.nfeData.numero || res.fileName.replace(/\.xml$/i, '')}.pdf`
          zip.file(pdfName, pdfBlob)
        }
      })

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `danfe_pdfs_convertidos_${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar pacote de PDFs:', err)
      alert('Erro ao gerar o arquivo ZIP dos PDFs.')
    }
  }

  const handleDownloadSingleXML = (result: PDFConversionResult) => {
    if (!result.xmlContent) return
    const blob = new Blob([result.xmlContent], { type: 'text/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.fileName.replace(/\.pdf$/i, '.xml')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadAllXMLZIP = async () => {
    const activexmls = results.filter(r => r.xmlContent)
    if (activexmls.length === 0) return

    const zip = new JSZip()
    activexmls.forEach((res) => {
      if (res.xmlContent) {
        zip.file(res.fileName.replace(/\.pdf$/i, '.xml'), res.xmlContent)
      }
    })

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = 'xml_convertidos_nfe.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const parseBRFloat = (val: string | number | undefined | null): number => {
    if (val === undefined || val === null) return 0
    if (typeof val === 'number') return isNaN(val) ? 0 : val
    const str = String(val).trim()
    if (!str) return 0
    if (str.includes(',')) {
      const cleanStr = str.replace(/\./g, '').replace(',', '.')
      const num = parseFloat(cleanStr)
      return isNaN(num) ? 0 : num
    }
    const num = parseFloat(str)
    return isNaN(num) ? 0 : num
  }

  const getResultQuantidade = (res: PDFConversionResult): number => {
    // 1. PRIORIDADE ABSOLUTA: Tentar buscar o PESO LÍQUIDO da Nota Fiscal (nfeData ou parsedData)
    if (res.nfeData?.transportador?.pesoLiquido && Number(res.nfeData.transportador.pesoLiquido) > 0) {
      return Number(res.nfeData.transportador.pesoLiquido)
    }

    if (res.parsedData?.transpPesoL) {
      const pesoL = parseBRFloat(res.parsedData.transpPesoL)
      if (pesoL > 0) return pesoL
    }

    // 2. Se não houver Peso Líquido, buscar a Quantidade de Produtos / Itens (Coluna QUANT)
    if (res.nfeData?.itens && res.nfeData.itens.length > 0) {
      const sumItens = res.nfeData.itens.reduce((acc, item) => acc + (Number(item.quantidade) || 0), 0)
      if (sumItens > 0) return sumItens
    }

    const d = res.parsedData
    if (d) {
      if (d.prodQCom !== undefined && d.prodQCom !== null && !isNaN(Number(d.prodQCom)) && Number(d.prodQCom) > 0) {
        return Number(d.prodQCom)
      }
      if (d.quantidade !== undefined && d.quantidade !== null && !isNaN(Number(d.quantidade)) && Number(d.quantidade) > 0) {
        return Number(d.quantidade)
      }
    }

    if (res.nfeData?.transportador?.quantidade) {
      const transpQtd = Number(res.nfeData.transportador.quantidade) || 0
      if (transpQtd > 0) return transpQtd
    }

    if (d?.transpQVol !== undefined && d?.transpQVol !== null) {
      const volQtd = parseBRFloat(d.transpQVol)
      if (volQtd > 0) return volQtd
    }

    // 3. Fallback procurando linha da tabela de produtos / coluna QUANT no rawSnippet ou XML
    const rawText = `${res.parsedData?.rawSnippet || ''} ${res.xmlContent || ''}`
    if (rawText.length > 10) {
      // Ex: "47.020,00 QUILOGRAMA 73.800,00 47.020,00"
      const vol4ColMatch = rawText.match(/(?:QUANTIDADE\s+ESP[EÉ]CIE[\s\S]{1,160}?|\b)(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)\s+[A-Za-zÀ-Ú]+\s+(?:\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)/i)
      if (vol4ColMatch && vol4ColMatch[2]) {
        const qVal = parseBRFloat(vol4ColMatch[2])
        if (qVal > 0) return qVal
      }

      // Ex: "PESO LÍQUIDO 47.020,00" ou "PESO LIQUIDO: 47.020,00"
      const pesoLMatch = rawText.match(/(?:PESO\s+(?:L[ÍI]QUIDO|LIQ)|P\.\s*L[ÍI]Q)[\s\S]{0,30}?(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)/i)
      if (pesoLMatch) {
        const qVal = parseBRFloat(pesoLMatch[1])
        if (qVal > 0) return qVal
      }

      const quantTonMatch = rawText.match(/(?:5\d{3}|6\d{3})?\s*(?:TON|TONELADA|TO|T)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b)/i)
      if (quantTonMatch) {
        const qVal = parseBRFloat(quantTonMatch[1])
        if (qVal > 0) return qVal
      }

      // XML tag <pesoL> ou <qCom>
      const xmlPesoLMatch = rawText.match(/<pesoL>([^<]+)<\/pesoL>/i)
      if (xmlPesoLMatch) {
        const qVal = parseBRFloat(xmlPesoLMatch[1])
        if (qVal > 0) return qVal
      }

      const xmlQComMatch = rawText.match(/<qCom>([^<]+)<\/qCom>/i)
      if (xmlQComMatch) {
        const qVal = parseBRFloat(xmlQComMatch[1])
        if (qVal > 0) return qVal
      }

      const directQuantMatch = rawText.match(/(?:QUANT(?:IDADE|\.)?|QTD)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b)/i)
      if (directQuantMatch) {
        const qVal = parseBRFloat(directQuantMatch[1])
        if (qVal > 0) return qVal
      }
    }

    return 0
  }

  const handleDownloadAllExcel = () => {
    const activeResults = results.filter(r => r.parsedData)
    if (activeResults.length === 0) {
      alert('Nenhuma nota processada com sucesso para exportar para o Excel.')
      return
    }

    const dataRows = activeResults.map((res) => {
      const d = res.parsedData
      const key = d?.chave || getNormalizedKey(res) || ''
      const emitCNPJ = d?.emitCNPJ || res.nfeData?.emitente?.cnpj || ''
      const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
      const vCNPJ = verifyChaveCNPJ(key, emitCNPJ, destCNPJ)

      return {
        'Nome do Arquivo': res.fileName,
        'Tipo Arquivo': res.fileType === 'pdf' ? 'PDF' : 'XML',
        'Nº Nota (nNF)': d?.nNF || '',
        'Série': d?.serie || '',
        'Chave de Acesso': key,
        'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
        'Destinatário CNPJ': destCNPJ,
        'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
        'Status Validação CNPJ': vCNPJ.statusLabel,
        'Emitente': d?.emitNome || '',
        'CNPJ Emitente': emitCNPJ,
        'Destinatário': d?.destNome || '',
        'Quantidade': getResultQuantidade(res),
        'Valor Total Nota (R$)': d?.vNF || '',
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(dataRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Notas Processadas')

    const max_len = dataRows.reduce((w: any, r: any) => {
      Object.keys(r).forEach((key, idx) => {
        const val = String(r[key]);
        w[idx] = Math.max(w[idx] || 0, val.length, key.length);
      });
      return w;
    }, []);
    worksheet['!cols'] = max_len.map((len: number) => ({ wch: len + 3 }));

    XLSX.writeFile(workbook, `consolidado_notas_${subMode}_${Date.now()}.xlsx`)
  }

  const handleClear = () => {
    setResults([])
  }

  // =========================================================================
  // LÓGICA DE PROCESSAMENTO DA PLANILHA EXCEL DE CONFERÊNCIA DE CHAVES
  // =========================================================================
  const processExcelWorkbook = (
    workbook: XLSX.WorkBook,
    fileName: string,
    weightColumnChoice: string = selectedExcelWeightCol
  ) => {
    const keysMap = new Map<string, ExcelMatchInfo>()
    const allKeysList: string[] = []
    const allRowsList: ExcelRowRecord[] = []
    let totalRows = 0
    const allColsSet = new Set<string>()

    const globalWagonMap = new Map<string, { vagao: string; sheetName: string; sumPeso: number; tara: number; count: number; rows: number[] }>()

    // Pré-análise: contar chaves de 44 dígitos por aba
    const sheetKeyCounts = new Map<string, number>()
    let totalKeysInWorkbook = 0

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName]
      if (!ws) return
      const sRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      let count = 0
      sRows.forEach((row) => {
        if (!Array.isArray(row)) return
        row.forEach((cell) => {
          if (cell === undefined || cell === null) return
          const cellStr = String(cell).trim()
          if (cellStr.length < 40) return
          const digits = cellStr.replace(/\D/g, '')
          if (digits.length === 44 || (digits.length > 44 && cellStr.match(/\b\d{44}\b/))) {
            count++
          }
        })
      })
      sheetKeyCounts.set(sheetName, count)
      totalKeysInWorkbook += count
    })

    // Filtrar apenas abas relevantes: se o arquivo tem abas com chaves de 44 dígitos, ignorar abas auxiliares vazias
    const targetSheetNames = totalKeysInWorkbook > 0
      ? workbook.SheetNames.filter((s) => (sheetKeyCounts.get(s) || 0) > 0)
      : workbook.SheetNames

    targetSheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
      totalRows += rows.length

      // Coletar nomes de todas as colunas para o seletor do usuário
      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const headerRow = rows[r]
        if (!headerRow) continue
        headerRow.forEach((c) => {
          const colName = String(c || '').trim()
          if (colName && colName.length < 80 && !allColsSet.has(colName)) {
            allColsSet.add(colName)
          }
        })
      }

      // Identificar colunas no cabeçalho
      let pesoColIndex = -1
      let pesoNotaVagaoColIndex = -1
      let taraColIndex = -1
      let vagaoColIndex = -1
      let brutoColIndex = -1

      for (let r = 0; r < Math.min(rows.length, 30); r++) {
        const headerRow = rows[r]
        if (!headerRow) continue
        for (let c = 0; c < headerRow.length; c++) {
          const cellStr = String(headerRow[c] || '').trim().toLowerCase()

          if (
            pesoNotaVagaoColIndex === -1 &&
            (cellStr.includes('peso_nota_vagao') ||
              cellStr.includes('peso nota vagao') ||
              cellStr.includes('peso_nota_vagão') ||
              cellStr.includes('peso nota vagão') ||
              cellStr.includes('peso_vagao') ||
              cellStr.includes('peso vagao') ||
              cellStr.includes('peso_rateado'))
          ) {
            pesoNotaVagaoColIndex = c
          }

          if (
            taraColIndex === -1 &&
            (cellStr === 'tara' ||
              cellStr.includes('tara_vagao') ||
              cellStr.includes('tara vagao') ||
              cellStr.includes('tara_vagão') ||
              cellStr.includes('tara(kg)') ||
              cellStr.includes('tara (kg)') ||
              cellStr.includes('tara (t)'))
          ) {
            taraColIndex = c
          }

          if (
            vagaoColIndex === -1 &&
            (cellStr === 'vagao' ||
              cellStr === 'vagão' ||
              cellStr.includes('num_vagao') ||
              cellStr.includes('numero_vagao') ||
              cellStr.includes('nº vagao') ||
              cellStr.includes('cod_vagao') ||
              cellStr.includes('serie_vag'))
          ) {
            vagaoColIndex = c
          }

          if (
            brutoColIndex === -1 &&
            (cellStr === 'bruto' ||
              cellStr.includes('peso_bruto') ||
              cellStr.includes('peso bruto') ||
              cellStr.includes('bruto_vagao'))
          ) {
            brutoColIndex = c
          }

          // Identificação da Coluna de Peso Selecionado
          if (pesoColIndex === -1) {
            if (weightColumnChoice === 'none') {
              pesoColIndex = -1
            } else if (weightColumnChoice && weightColumnChoice !== 'auto') {
              if (String(headerRow[c] || '').trim().toLowerCase() === weightColumnChoice.trim().toLowerCase()) {
                pesoColIndex = c
              }
            } else {
              // Modo Automático: BUSCA ESTRITAMENTE a coluna "Peso Selecionado" / "peso_selecionado" / "peso sel"
              // REGRA CRÍTICA: NÃO faz fallback para outras colunas (como peso liq, balança, quant, etc.)!
              if (
                cellStr === 'peso selecionado' ||
                cellStr === 'peso_selecionado' ||
                cellStr === 'peso_sel' ||
                cellStr === 'peso sel' ||
                cellStr === 'peso selec' ||
                cellStr === 'peso_selec' ||
                cellStr.startsWith('peso selecionado') ||
                cellStr.startsWith('peso_selecionado') ||
                cellStr.startsWith('peso sel ')
              ) {
                pesoColIndex = c
              }
            }
          }
        }
      }

      // Estrutura temporária para armazenar registros e agrupar por vagão
      interface TempRowRecord {
        rowIndex: number
        sheetName: string
        keys: string[]
        rawValue: string
        pesoSelecionado: number | null
        pesoSelecionadoStr: string
        pesoNotaVagao: number | null
        pesoNotaVagaoStr: string
        tara: number | null
        taraStr: string
        vagao: string
        brutoRow: number | null
        hasData: boolean
      }

      const tempRowRecords: TempRowRecord[] = []

      rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) return
        const hasContent = row.some(c => String(c !== undefined && c !== null ? c : '').trim() !== '')
        if (!hasContent) return

        // Pular cabeçalho principal nas primeiras linhas
        if (rowIndex < 5) {
          const isHeader = row.some((c) => {
            const s = String(c || '').trim().toLowerCase()
            return s === 'chave' || s === 'chave de acesso' || s === 'chave_de_acesso' || s === 'vagao' || s === 'vagão'
          })
          if (isHeader) return
        }

        // REGRA ESTRITA: Extração exclusiva da coluna de Peso Selecionado.
        // Se a linha não tiver valor nesta coluna, NÃO busca em nenhuma outra coluna!
        let pesoSelecionado: number | null = null
        let pesoSelecionadoStr = ''

        if (
          pesoColIndex !== -1 &&
          row[pesoColIndex] !== undefined &&
          row[pesoColIndex] !== null &&
          String(row[pesoColIndex]).trim() !== ''
        ) {
          const rawVal = String(row[pesoColIndex]).trim()
          const numVal = parseBRFloat(rawVal)
          if (!isNaN(numVal) && numVal > 0) {
            pesoSelecionado = numVal
            pesoSelecionadoStr = rawVal
          }
        }

        let pesoNotaVagao: number | null = null
        let pesoNotaVagaoStr = ''
        if (
          pesoNotaVagaoColIndex !== -1 &&
          row[pesoNotaVagaoColIndex] !== undefined &&
          row[pesoNotaVagaoColIndex] !== null &&
          String(row[pesoNotaVagaoColIndex]).trim() !== ''
        ) {
          const rawVal = String(row[pesoNotaVagaoColIndex]).trim()
          const numVal = parseBRFloat(rawVal)
          if (!isNaN(numVal) && numVal > 0) {
            pesoNotaVagao = numVal
            pesoNotaVagaoStr = rawVal
          }
        }

        let tara: number | null = null
        let taraStr = ''
        if (
          taraColIndex !== -1 &&
          row[taraColIndex] !== undefined &&
          row[taraColIndex] !== null &&
          String(row[taraColIndex]).trim() !== ''
        ) {
          const rawVal = String(row[taraColIndex]).trim()
          const numVal = parseBRFloat(rawVal)
          if (!isNaN(numVal) && numVal > 0) {
            tara = numVal
            taraStr = rawVal
          }
        }

        let vagao = ''
        if (
          vagaoColIndex !== -1 &&
          row[vagaoColIndex] !== undefined &&
          row[vagaoColIndex] !== null
        ) {
          vagao = String(row[vagaoColIndex]).trim()
        }

        let brutoRow: number | null = null
        if (
          brutoColIndex !== -1 &&
          row[brutoColIndex] !== undefined &&
          row[brutoColIndex] !== null &&
          String(row[brutoColIndex]).trim() !== ''
        ) {
          const rawVal = String(row[brutoColIndex]).trim()
          const numVal = parseBRFloat(rawVal)
          if (!isNaN(numVal) && numVal > 0) {
            brutoRow = numVal
          }
        }

        // Extração de chaves de acesso
        const rowKeys: string[] = []
        let primaryRawValue = ''

        row.forEach((cellVal) => {
          if (!cellVal) return
          const strVal = String(cellVal).trim()

          const foundKeys = findKeysInText(strVal)
          if (foundKeys.length > 0) {
            foundKeys.forEach((k) => {
              if (!rowKeys.includes(k)) rowKeys.push(k)
            })
            if (!primaryRawValue) primaryRawValue = strVal
          } else {
            const digitsOnly = strVal.replace(/\D/g, '')
            if (digitsOnly.length === 44 && isValidNFeKey(digitsOnly)) {
              if (!rowKeys.includes(digitsOnly)) rowKeys.push(digitsOnly)
              if (!primaryRawValue) primaryRawValue = strVal
            } else if (digitsOnly.length === 43 && isValidNFeKey('0' + digitsOnly)) {
              const fixedKey = '0' + digitsOnly
              if (!rowKeys.includes(fixedKey)) rowKeys.push(fixedKey)
              if (!primaryRawValue) primaryRawValue = strVal
            }
          }
        })

        tempRowRecords.push({
          rowIndex: rowIndex + 1,
          sheetName,
          keys: rowKeys,
          rawValue: primaryRawValue || (rowKeys.length > 0 ? rowKeys[0] : String(row.filter(c => String(c || '').trim() !== '').join(' | '))),
          pesoSelecionado,
          pesoSelecionadoStr,
          pesoNotaVagao,
          pesoNotaVagaoStr,
          tara,
          taraStr,
          vagao,
          brutoRow,
          hasData: true,
        })
      })

      // Agrupar por Vagão para calcular somatório do peso da nota no vagão e tara
      const wagonTotals = new Map<string, { sumPeso: number; tara: number; bruto: number; count: number }>()

      tempRowRecords.forEach((rec) => {
        if (!rec.vagao) return
        const effPeso = rec.pesoNotaVagao ?? rec.pesoSelecionado ?? 0
        const curr = wagonTotals.get(rec.vagao) || { sumPeso: 0, tara: 0, bruto: 0, count: 0 }
        wagonTotals.set(rec.vagao, {
          sumPeso: curr.sumPeso + effPeso,
          tara: rec.tara && rec.tara > 0 ? rec.tara : curr.tara,
          bruto: rec.brutoRow && rec.brutoRow > 0 ? rec.brutoRow : curr.bruto,
          count: curr.count + 1,
        })

        const gCurr = globalWagonMap.get(rec.vagao) || { vagao: rec.vagao, sheetName, sumPeso: 0, tara: 0, count: 0, rows: [] }
        globalWagonMap.set(rec.vagao, {
          vagao: rec.vagao,
          sheetName,
          sumPeso: gCurr.sumPeso + effPeso,
          tara: rec.tara && rec.tara > 0 ? rec.tara : gCurr.tara,
          count: gCurr.count + 1,
          rows: [...gCurr.rows, rec.rowIndex],
        })
      })

      // Processar cada registro e alimentar keysMap e allRowsList
      tempRowRecords.forEach((rec) => {
        const effPeso = rec.pesoNotaVagao ?? rec.pesoSelecionado ?? 0
        let pesoBrutoCalc: number | null = null
        let effTara = rec.tara

        if (rec.vagao && wagonTotals.has(rec.vagao)) {
          const wInfo = wagonTotals.get(rec.vagao)!
          if (wInfo.tara > 0) {
            effTara = wInfo.tara
          }
          if (wInfo.sumPeso > 0 || wInfo.tara > 0) {
            // SOMA DE TODOS OS RATEIOS DE PESO_NOTA_VAGAO DO VAGÃO + A TARA ÚNICA DO VAGÃO
            pesoBrutoCalc = Math.round((wInfo.sumPeso + wInfo.tara) * 1000) / 1000
          } else if (wInfo.bruto > 0) {
            pesoBrutoCalc = wInfo.bruto
          } else if (effPeso > 0) {
            pesoBrutoCalc = effPeso + (effTara || 0)
          }
        } else if (effPeso > 0) {
          pesoBrutoCalc = effPeso + (rec.tara || 0)
        }

        let pesoBrutoStr = ''
        if (pesoBrutoCalc !== null && !isNaN(pesoBrutoCalc) && pesoBrutoCalc > 0) {
          pesoBrutoStr = pesoBrutoCalc.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 3,
          })
        }

        const finalTaraStr = (effTara && effTara > 0)
          ? effTara.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
          : rec.taraStr

        if (rec.keys.length > 0) {
          rec.keys.forEach((k) => {
            if (!keysMap.has(k)) {
              keysMap.set(k, {
                row: rec.rowIndex,
                rawValue: rec.rawValue,
                sheetName: rec.sheetName,
                pesoSelecionado: rec.pesoSelecionado,
                pesoSelecionadoStr: rec.pesoSelecionadoStr,
                pesoNotaVagao: rec.pesoNotaVagao,
                pesoNotaVagaoStr: rec.pesoNotaVagaoStr,
                tara: effTara,
                taraStr: finalTaraStr,
                vagao: rec.vagao,
                pesoBruto: pesoBrutoCalc,
                pesoBrutoStr,
              })
              allKeysList.push(k)
            }

            allRowsList.push({
              id: `${rec.sheetName}_r${rec.rowIndex}_${k}`,
              sheetName: rec.sheetName,
              row: rec.rowIndex,
              key: k,
              vagao: rec.vagao,
              pesoSelecionado: rec.pesoSelecionado,
              pesoSelecionadoStr: rec.pesoSelecionadoStr,
              pesoNotaVagao: rec.pesoNotaVagao,
              pesoNotaVagaoStr: rec.pesoNotaVagaoStr,
              tara: effTara,
              taraStr: finalTaraStr,
              pesoBruto: pesoBrutoCalc,
              pesoBrutoStr,
              rawValue: rec.rawValue,
              hasData: true,
            })
          })
        } else {
          // Linha do Excel sem chave de 44 dígitos
          allRowsList.push({
            id: `${rec.sheetName}_r${rec.rowIndex}_nokey`,
            sheetName: rec.sheetName,
            row: rec.rowIndex,
            key: undefined,
            vagao: rec.vagao,
            pesoSelecionado: rec.pesoSelecionado,
            pesoSelecionadoStr: rec.pesoSelecionadoStr,
            pesoNotaVagao: rec.pesoNotaVagao,
            pesoNotaVagaoStr: rec.pesoNotaVagaoStr,
            tara: effTara,
            taraStr: finalTaraStr,
            pesoBruto: pesoBrutoCalc,
            pesoBrutoStr,
            rawValue: rec.rawValue,
            hasData: true,
          })
        }
      })
    })

    const wagonSummariesList: WagonSummary[] = Array.from(globalWagonMap.values()).map((w) => {
      const pesoBrutoTotal = w.sumPeso + w.tara
      const somaPesoNotaVagaoStr = w.sumPeso > 0
        ? w.sumPeso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        : '0,00'
      const taraStr = w.tara > 0
        ? w.tara.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        : '0,00'
      const pesoBrutoTotalStr = pesoBrutoTotal > 0
        ? pesoBrutoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        : '0,00'
      const linhas = w.rows.length <= 8
        ? `Linhas ${w.rows.join(', ')}`
        : `Linhas ${w.rows.slice(0, 8).join(', ')}... (+${w.rows.length - 8})`

      return {
        vagao: w.vagao,
        sheetName: w.sheetName,
        qtdNotas: w.count,
        somaPesoNotaVagao: w.sumPeso,
        somaPesoNotaVagaoStr,
        tara: w.tara,
        taraStr,
        pesoBrutoTotal,
        pesoBrutoTotalStr,
        linhas,
      }
    })

    setAvailableExcelColumns(Array.from(allColsSet))
    setExcelData({
      fileName,
      totalRows,
      keysMap,
      allKeysList,
      allRowsList,
      sheets: workbook.SheetNames,
      wagonSummaries: wagonSummariesList,
    })
  }

  const parseExcelForKeys = async (file: File) => {
    setIsExcelLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      setRawWorkbook(workbook)
      setExcelFileName(file.name)
      processExcelWorkbook(workbook, file.name, selectedExcelWeightCol)
    } catch (err) {
      console.error('Erro ao ler planilha Excel:', err)
      alert('Falha ao ler o arquivo Excel. Verifique se o arquivo está no formato correto (.xlsx, .xls ou .csv).')
    } finally {
      setIsExcelLoading(false)
    }
  }

  const handleExcelWeightColChange = (newCol: string) => {
    setSelectedExcelWeightCol(newCol)
    if (rawWorkbook) {
      processExcelWorkbook(rawWorkbook, excelFileName, newCol)
    }
  }

  const handleExcelInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      parseExcelForKeys(e.target.files[0])
    }
  }

  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
        parseExcelForKeys(file)
      } else {
        alert('Por favor, envie um arquivo Excel (.xlsx, .xls) ou CSV.')
      }
    }
  }

  const handleRemoveExcel = () => {
    setExcelData(null)
    setRawWorkbook(null)
    setExcelFileName('')
    setAvailableExcelColumns([])
    setSelectedExcelWeightCol('auto')
    setExcelFilter('all')
    setExcelSearchQuery('')
    if (excelInputRef.current) {
      excelInputRef.current.value = ''
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Estatísticas de cruzamento com a planilha
  const validConvertedResults = results.filter(r => r.parsedData)
  
  const getNormalizedKey = (res: PDFConversionResult): string => {
    let raw = res.parsedData?.chave || res.nfeData?.chaveAcesso || ''
    if (!raw && res.xmlContent) {
      const found = findKeysInText(res.xmlContent)
      if (found.length > 0) raw = found[0]
    }
    let digits = String(raw).replace(/\D/g, '').trim()
    if (digits.length === 43 && isValidNFeKey('0' + digits)) {
      digits = '0' + digits
    }
    return digits
  }

  const getExcelMatchInfo = (rawKey: string): ExcelMatchInfo | null => {
    if (!excelData || !rawKey) return null
    let digits = String(rawKey).replace(/\D/g, '').trim()
    if (!digits) return null

    // Match direto
    if (excelData.keysMap.has(digits)) {
      return excelData.keysMap.get(digits)!
    }

    // Se possui 43 dígitos, tenta com '0' na frente
    if (digits.length === 43 && isValidNFeKey('0' + digits)) {
      const padded = '0' + digits
      if (excelData.keysMap.has(padded)) {
        return excelData.keysMap.get(padded)!
      }
    }

    // Se possui 44 dígitos e começa com '0', tenta sem o '0' inicial (caso o Excel tenha perdido o zero inicial)
    if (digits.length === 44 && digits.startsWith('0')) {
      const unpadded = digits.substring(1)
      if (excelData.keysMap.has(unpadded)) {
        return excelData.keysMap.get(unpadded)!
      }
    }

    return null
  }

  const matchedResults = validConvertedResults.filter(res => {
    const key = getNormalizedKey(res)
    return !!getExcelMatchInfo(key)
  })

  const unmatchedResults = validConvertedResults.filter(res => {
    const key = getNormalizedKey(res)
    return !getExcelMatchInfo(key)
  })

  // Conjunto de chaves do Excel que efetivamente possuem um arquivo importado correspondente
  const matchedExcelKeysSet = new Set<string>()

  validConvertedResults.forEach(res => {
    const key = getNormalizedKey(res)
    if (!key) return
    const matchInfo = getExcelMatchInfo(key)
    if (matchInfo && excelData) {
      for (const [eKey, info] of excelData.keysMap.entries()) {
        if (
          info === matchInfo ||
          eKey === key ||
          (eKey.length === 43 && '0' + eKey === key) ||
          (key.length === 43 && '0' + key === eKey)
        ) {
          matchedExcelKeysSet.add(eKey)
        }
      }
    }
  })

  const excelRowsWithoutFiles = excelData
    ? excelData.allRowsList.filter((r) => {
        if (r.key) {
          return !matchedExcelKeysSet.has(r.key) && !matchedExcelKeysSet.has('0' + r.key) && !(r.key.startsWith('0') && matchedExcelKeysSet.has(r.key.substring(1)))
        }
        return true
      })
    : []

  const excelKeysWithoutFiles = excelData 
    ? excelData.allKeysList.filter(k => !matchedExcelKeysSet.has(k))
    : []

  // Filtragem para a tabela/lista
  const filteredConvertedResults = validConvertedResults.filter(res => {
    const key = getNormalizedKey(res)
    const matchInfo = getExcelMatchInfo(key)
    const isMatched = !!matchInfo

    if (excelFilter === 'matched' && !isMatched) return false
    if (excelFilter === 'unmatched' && isMatched) return false
    if (excelFilter === 'excel_only') return false

    if (excelFilter === 'weight_divergent') {
      const qtd = getResultQuantidade(res)
      const vWeight = confrontWeights(matchInfo, qtd)
      if (vWeight.status !== 'DIVERGENTE') return false
    }

    if (excelSearchQuery.trim().length > 0) {
      const query = excelSearchQuery.toLowerCase()
      const fileNameMatches = res.fileName.toLowerCase().includes(query)
      const keyMatches = key.includes(query)
      const nNFMatches = String(res.parsedData?.nNF || '').includes(query)
      const emitMatches = String(res.parsedData?.emitNome || '').toLowerCase().includes(query)
      return fileNameMatches || keyMatches || nNFMatches || emitMatches
    }

    return true
  })

  // Ações de Auditoria de Pesos em Lote com IA
  const handleAuditAllNfeWeights = async () => {
    const divergentItems = validConvertedResults.filter((res) => {
      const k = getNormalizedKey(res)
      const m = getExcelMatchInfo(k)
      return m && confrontWeights(m, getResultQuantidade(res)).status === 'DIVERGENTE'
    })

    if (divergentItems.length === 0) return

    setIsAuditingAllWeights(true)
    try {
      const payload: WeightAuditItemInput[] = divergentItems.map((res) => {
        const k = getNormalizedKey(res)
        const m = getExcelMatchInfo(k)
        const d = res.parsedData
        const qtdNota = getResultQuantidade(res)
        const vWeight = confrontWeights(m, qtdNota)
        const prodInfo = `QUANT: ${d?.prodQCom || qtdNota} | UN: ${d?.prodUCom || 'KG'} | PesoLiq: ${d?.transpPesoL || ''} | PesoBruto: ${d?.transpPesoB || ''} | Vol: ${d?.transpQVol || ''}`
        const snippetFull = d?.rawSnippet ? `${prodInfo}\nTrecho DANFE:\n${d.rawSnippet}` : `${prodInfo}\nNF ${d?.nNF || ''} Emit: ${d?.emitNome || ''} Dest: ${d?.destNome || ''} Chave: ${k} DadosAdicionais: ${d?.infCpl || ''}`
        return {
          id: k || res.fileName,
          identificador: d?.nNF ? `NF ${d.nNF}` : res.fileName,
          numeroApenas: d?.nNF || '',
          serie: d?.serie || '',
          pesoMDF: overrideWeightsMap[k || res.fileName] !== undefined ? overrideWeightsMap[k || res.fileName] : qtdNota,
          pesoExcel: vWeight.pesoExcel || undefined,
          diferencaPeso: vWeight.diferenca || undefined,
          trechoTextoDocumento: snippetFull,
          linhaExcel: m?.row,
          dadosExcelRaw: m?.rawValue,
        }
      })

      const response = await auditarDivergenciasComIA(payload)
      setAuditSummary(response)
      setAuditResultsMap((prev) => {
        const next = { ...prev }
        response.resultados.forEach((r) => {
          next[r.id] = r
        })
        return next
      })
    } catch (err) {
      console.error('Erro na auditoria IA de NF-e:', err)
    } finally {
      setIsAuditingAllWeights(false)
    }
  }

  const handleApplyAllNfeCorrections = () => {
    const nextOverrides = { ...overrideWeightsMap }
    Object.entries(auditResultsMap).forEach(([id, r]) => {
      if (r.status === 'ERRO_LEITURA_SISTEMA' && r.pesoCorrigidoDoc !== undefined && r.pesoCorrigidoDoc !== null) {
        nextOverrides[id] = r.pesoCorrigidoDoc
      }
    })
    setOverrideWeightsMap(nextOverrides)
  }

  // Helper para criar e formatar largura das colunas das abas do Excel
  const createFormattedWorksheet = (rows: any[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Mensagem': 'Nenhum registro encontrado nesta categoria' }])
    if (rows.length > 0) {
      const maxLenMap: number[] = []
      rows.forEach((row) => {
        Object.keys(row).forEach((colKey, colIdx) => {
          const valStr = String(row[colKey] ?? '')
          maxLenMap[colIdx] = Math.max(maxLenMap[colIdx] || 0, valStr.length, colKey.length)
        })
      })
      ws['!cols'] = maxLenMap.map((len) => ({ wch: Math.min(Math.max(len + 3, 12), 65) }))
    }
    return ws
  }

  // Helper para converter/normalizar valores de peso para KG (multiplica por 1000 se o valor estiver em Toneladas, ex: < 1000)
  const normalizeWeightKg = (rawVal: any): number | string => {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') return ''
    const num = parseBRFloat(rawVal)
    if (isNaN(num) || num === 0) return rawVal

    // Se o valor for menor que 1000 (ex: 45.5, 78.12, 120.5 T), significa que está em toneladas e deve ser multiplicado por 1000
    // Se o valor já for >= 1000 (ex: 45500, 78120, 120500 KG), já está multiplicado por 1000 e não deve multiplicar novamente
    if (Math.abs(num) < 1000) {
      return Math.round(num * 1000 * 1000) / 1000
    }
    return Math.round(num * 1000) / 1000
  }

  // Helper para extrair as linhas da "Planilha de Digitação" exatamente na sequência original
  const extractDigitacaoRows = (): any[] => {
    if (!rawWorkbook) return []

    // Mapa auxiliar com os dados dos PDFs/XMLs carregados indexados por chave e número
    const nfeMap = new Map<string, PDFConversionResult>()
    validConvertedResults.forEach((res) => {
      const key = getNormalizedKey(res) || res.parsedData?.chave || ''
      if (key) {
        nfeMap.set(key, res)
        if (key.length === 44 && key.startsWith('0')) {
          nfeMap.set(key.substring(1), res)
        }
      }
      const num = res.parsedData?.nNF || res.nfeData?.numero
      if (num) {
        nfeMap.set(`NUM_${num}`, res)
      }
    })

    const digitacaoRows: any[] = []

    rawWorkbook.SheetNames.forEach((sheetName) => {
      const worksheet = rawWorkbook.Sheets[sheetName]
      if (!worksheet) return
      const sheetJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
      if (!sheetJson || sheetJson.length === 0) return

      let headerRowIdx = -1
      const colMap: Record<string, number> = {}

      for (let r = 0; r < Math.min(sheetJson.length, 35); r++) {
        const row = sheetJson[r]
        if (!row || !Array.isArray(row)) continue
        const upperCells = row.map((c) => String(c || '').trim().toUpperCase())

        const isHeader = upperCells.some((c) =>
          c.includes('VAGAO') ||
          c.includes('VAGÃO') ||
          c.includes('SERIE') ||
          c.includes('BRUTO') ||
          c.includes('TARA') ||
          c.includes('CHAVE') ||
          c.includes('PESO') ||
          c.includes('EMISSAO') ||
          c.includes('EMISSÃO')
        )

        if (isHeader) {
          headerRowIdx = r
          upperCells.forEach((c, idx) => {
            if (!c) return
            const norm = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9_]/g, '_')
            colMap[c] = idx
            colMap[norm] = idx
          })
          break
        }
      }

      if (headerRowIdx === -1) {
        headerRowIdx = 0
      }

      const findColIdx = (candidates: string[]) => {
        for (const cand of candidates) {
          const upper = cand.toUpperCase()
          const norm = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9_]/g, '_')
          for (const k of Object.keys(colMap)) {
            if (k === upper || k === norm || k.includes(upper) || k.includes(norm)) {
              return colMap[k]
            }
          }
        }
        return -1
      }

      const serieVagaoCol = findColIdx(['SERIE_VAGAO', 'SERIE VAGAO', 'SERIE_VAGÃO', 'SERIE VAGÃO', 'SERIE', 'SERIEVAGAO'])
      const vagaoCol = findColIdx(['VAGAO', 'VAGÃO', 'NUM_VAGAO', 'NUMERO_VAGAO', 'NR_VAGAO', 'N_VAGAO', 'VAG'])
      const brutoCol = findColIdx(['BRUTO', 'PESO_BRUTO', 'PESO BRUTO', 'PESOBRUTO', 'BRUTO(KG)', 'BRUTO (KG)', 'BRUTO (T)', 'BRUTO(T)'])
      const taraCol = findColIdx(['TARA', 'TARA_VAGAO', 'TARA VAGAO', 'TARA_VAGÃO', 'TARA(KG)', 'TARA (KG)', 'TARA (T)', 'TARA(T)'])
      const dataEmissaoCol = findColIdx(['DATA_EMISSAO', 'DATA EMISSAO', 'DATA_EMISSÃO', 'DATA EMISSÃO', 'DATA_DE_EMISSAO', 'DATA DE EMISSAO', 'DHEMI', 'DEMI', 'DATA'])
      const pesoSelecionadoCol = findColIdx(['PESO_SELECIONADO', 'PESO SELECIONADO', 'PESO_LIQUIDO', 'PESO LIQUIDO', 'PESO_LÍQUIDO', 'PESO LÍQUIDO', 'PESOLIQUIDO', 'PESO_LIQ', 'PESO LIQ', 'QTD_NOTA', 'QUANTIDADE'])
      const pesoNotaVagaoCol = findColIdx(['PESO_NOTA_VAGAO', 'PESO NOTA VAGAO', 'PESO_NOTA_VAGÃO', 'PESO NOTA VAGÃO', 'PESO_VAGAO', 'PESO VAGAO', 'PESO_RATEADO'])
      const cnpjEmitenteCol = findColIdx(['CNPJ_EMITENTE', 'CNPJ EMITENTE', 'EMITENTE_CNPJ', 'CNPJ_EMIT', 'EMIT_CNPJ', 'EMITENTE'])
      const cnpjDestinatarioCol = findColIdx(['CNPJ_DESTINATARIO', 'CNPJ DESTINATARIO', 'DESTINATARIO_CNPJ', 'CNPJ_DEST', 'DEST_CNPJ', 'DESTINATARIO'])
      const numeroCol = findColIdx(['NUMERO', 'NÚMERO', 'Nº NOTA', 'NR_NOTA', 'NNF', 'NUM_NOTA', 'NUMERO_NOTA', 'NOTA'])
      const chaveCol = findColIdx(['CHAVE', 'CHAVE_DE_ACESSO', 'CHAVE DE ACESSO', 'CHAVE_ACESSO', 'NFE_CHAVE', 'CHAVENFE'])
      const transbordoExcelCol = findColIdx(['TRANSBORDO DO CTE', 'TRANSBORDO_DO_CTE', 'TRANSBORDO', 'CNPJ_TRANSBORDO', 'CNPJ TRANSBORDO', 'EXPEDIDOR', 'CNPJ_EXPEDIDOR'])

      // 1. Passo: Mapear e acumular todos os rateios (PESO_NOTA_VAGAO) e capturar a TARA ÚNICA de cada vagão
      const sheetWagonMap = new Map<string, { sumPesoNotaVagao: number; sumPesoSel: number; tara: number; bruto: number; count: number }>()

      for (let r = headerRowIdx + 1; r < sheetJson.length; r++) {
        const row = sheetJson[r]
        if (!row || !Array.isArray(row)) continue
        const hasAnyValue = row.some((c) => String(c !== undefined && c !== null ? c : '').trim() !== '')
        if (!hasAnyValue) continue

        const serieRaw = serieVagaoCol !== -1 && row[serieVagaoCol] !== undefined && row[serieVagaoCol] !== null ? String(row[serieVagaoCol]).trim() : ''
        const vagaoRaw = vagaoCol !== -1 && row[vagaoCol] !== undefined && row[vagaoCol] !== null ? String(row[vagaoCol]).trim() : ''
        let vId = ''
        if (serieRaw && vagaoRaw) {
          vId = vagaoRaw.toUpperCase().startsWith(serieRaw.toUpperCase()) ? vagaoRaw : `${serieRaw}${vagaoRaw}`
        } else {
          vId = serieRaw || vagaoRaw || ''
        }
        const vNorm = vId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
        if (!vNorm) continue

        const taraVal = taraCol !== -1 ? normalizeWeightKg(row[taraCol]) : 0
        const taraNum = typeof taraVal === 'number' ? taraVal : (taraVal ? parseBRFloat(taraVal) : 0)

        const pesoNotaVal = pesoNotaVagaoCol !== -1 ? normalizeWeightKg(row[pesoNotaVagaoCol]) : 0
        const pesoNotaNum = typeof pesoNotaVal === 'number' ? pesoNotaVal : (pesoNotaVal ? parseBRFloat(pesoNotaVal) : 0)

        const pesoSelVal = pesoSelecionadoCol !== -1 ? normalizeWeightKg(row[pesoSelecionadoCol]) : 0
        const pesoSelNum = typeof pesoSelVal === 'number' ? pesoSelVal : (pesoSelVal ? parseBRFloat(pesoSelVal) : 0)

        const brutoVal = brutoCol !== -1 ? normalizeWeightKg(row[brutoCol]) : 0
        const brutoNum = typeof brutoVal === 'number' ? brutoVal : (brutoVal ? parseBRFloat(brutoVal) : 0)

        const existing = sheetWagonMap.get(vNorm) || { sumPesoNotaVagao: 0, sumPesoSel: 0, tara: 0, bruto: 0, count: 0 }
        if (pesoNotaNum > 0) existing.sumPesoNotaVagao += pesoNotaNum
        if (pesoSelNum > 0) existing.sumPesoSel += pesoSelNum
        if (taraNum > 0 && (existing.tara === 0 || taraNum > existing.tara)) existing.tara = taraNum
        if (brutoNum > 0 && (existing.bruto === 0 || brutoNum > existing.bruto)) existing.bruto = brutoNum
        existing.count += 1
        sheetWagonMap.set(vNorm, existing)
      }

      // 2. Passo: Percorrer todas as linhas na sequência exata montando a digitação com PESO BRUTO REAL DO VAGÃO
      for (let r = headerRowIdx + 1; r < sheetJson.length; r++) {
        const row = sheetJson[r]
        if (!row || !Array.isArray(row)) continue

        const hasAnyValue = row.some((c) => String(c !== undefined && c !== null ? c : '').trim() !== '')
        if (!hasAnyValue) continue

        // Identificar e extrair chave de acesso limpa com 44 dígitos (extraindo letras como NFe...)
        let rowKey = ''
        if (chaveCol !== -1 && row[chaveCol] !== undefined && row[chaveCol] !== null) {
          const rawK = String(row[chaveCol]).replace(/\D/g, '')
          if (rawK.length >= 44) {
            rowKey = rawK.substring(rawK.length - 44)
          } else if (rawK.length > 0) {
            rowKey = rawK
          }
        }
        if (!rowKey || rowKey.length < 44) {
          for (const cell of row) {
            const rawDigits = String(cell || '').replace(/\D/g, '')
            if (rawDigits.length >= 44) {
              rowKey = rawDigits.substring(rawDigits.length - 44)
              break
            }
          }
        }

        const linkedNfe = rowKey ? nfeMap.get(rowKey) : null

        // 1. vagao: concatenação dos valores SERIE_VAGAO e VAGAO
        const serieRaw = serieVagaoCol !== -1 && row[serieVagaoCol] !== undefined && row[serieVagaoCol] !== null ? String(row[serieVagaoCol]).trim() : ''
        const vagaoRaw = vagaoCol !== -1 && row[vagaoCol] !== undefined && row[vagaoCol] !== null ? String(row[vagaoCol]).trim() : ''

        let vagaoFinal = ''
        if (serieRaw && vagaoRaw) {
          if (vagaoRaw.toUpperCase().startsWith(serieRaw.toUpperCase())) {
            vagaoFinal = vagaoRaw
          } else {
            vagaoFinal = `${serieRaw}${vagaoRaw}`
          }
        } else {
          vagaoFinal = serieRaw || vagaoRaw || ''
        }

        const vNorm = vagaoFinal.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
        const wagonInfo = vNorm ? sheetWagonMap.get(vNorm) : null

        // 3. TARA: usar a tara única do vagão (se identificada) ou a da linha
        const taraFinalRaw = taraCol !== -1 ? normalizeWeightKg(row[taraCol]) : ''
        const taraNumRow = typeof taraFinalRaw === 'number' ? taraFinalRaw : (taraFinalRaw ? parseBRFloat(taraFinalRaw) : 0)
        const taraFinalNum = (wagonInfo && wagonInfo.tara > 0) ? wagonInfo.tara : taraNumRow
        const taraFinal = taraFinalNum > 0 ? taraFinalNum : taraFinalRaw

        // 5. PESO_SELECIONADO: multiplicar por 1000 se não estiver em KG
        const pesoSelecionadoFinal = pesoSelecionadoCol !== -1 ? normalizeWeightKg(row[pesoSelecionadoCol]) : ''

        // 6. PESO_NOTA_VAGAO: multiplicar por 1000 se não estiver em KG
        const pesoNotaVagaoFinal = pesoNotaVagaoCol !== -1 ? normalizeWeightKg(row[pesoNotaVagaoCol]) : ''

        // 2. BRUTO: O BRUTO DEVE SER IGUAL À SOMA DE TODOS OS RATEIOS DA COLUNA PESO_NOTA_VAGAO + A TARA ÚNICA DO VAGÃO
        let brutoFinal: number | string = ''
        const effWagonSumPeso = (wagonInfo && wagonInfo.sumPesoNotaVagao > 0)
          ? wagonInfo.sumPesoNotaVagao
          : (wagonInfo && wagonInfo.sumPesoSel > 0 ? wagonInfo.sumPesoSel : 0)

        const pesoNotaNumRow = typeof pesoNotaVagaoFinal === 'number' ? pesoNotaVagaoFinal : (pesoNotaVagaoFinal ? parseBRFloat(pesoNotaVagaoFinal) : 0)

        if (wagonInfo && (wagonInfo.tara > 0 || effWagonSumPeso > 0)) {
          brutoFinal = Math.round((wagonInfo.tara + effWagonSumPeso) * 1000) / 1000
        } else if (taraNumRow > 0 || pesoNotaNumRow > 0) {
          brutoFinal = Math.round((taraNumRow + pesoNotaNumRow) * 1000) / 1000
        } else if (wagonInfo && wagonInfo.bruto > 0) {
          brutoFinal = wagonInfo.bruto
        } else if (brutoCol !== -1 && row[brutoCol] !== undefined && row[brutoCol] !== null && String(row[brutoCol]).trim() !== '') {
          brutoFinal = normalizeWeightKg(row[brutoCol])
        }

        // 4. data_emissao: extrair somente a data (ex: "18/08/2026 15:02:12" -> "18/08/2026")
        let dataEmissaoFinal = ''
        let rawData = dataEmissaoCol !== -1 && row[dataEmissaoCol] !== undefined && row[dataEmissaoCol] !== null
          ? String(row[dataEmissaoCol]).trim()
          : ''

        if (!rawData && linkedNfe?.parsedData?.dataEmissao) {
          rawData = String(linkedNfe.parsedData.dataEmissao).trim()
        } else if (!rawData && linkedNfe?.nfeData?.dataEmissao) {
          rawData = String(linkedNfe.nfeData.dataEmissao).trim()
        }

        if (rawData) {
          if (rawData.includes(' ')) {
            dataEmissaoFinal = rawData.split(' ')[0].trim()
          } else if (rawData.includes('T')) {
            const datePart = rawData.split('T')[0].trim()
            if (datePart.includes('-')) {
              const [y, m, d] = datePart.split('-')
              dataEmissaoFinal = `${d}/${m}/${y}`
            } else {
              dataEmissaoFinal = datePart
            }
          } else {
            dataEmissaoFinal = rawData
          }
        }

        // 7. CNPJ_EMITENTE
        let cnpjEmitenteFinal = ''
        if (cnpjEmitenteCol !== -1 && row[cnpjEmitenteCol] !== undefined && row[cnpjEmitenteCol] !== null && String(row[cnpjEmitenteCol]).trim() !== '') {
          cnpjEmitenteFinal = String(row[cnpjEmitenteCol]).trim()
        } else if (linkedNfe?.parsedData?.emitCNPJ) {
          cnpjEmitenteFinal = String(linkedNfe.parsedData.emitCNPJ).trim()
        } else if (linkedNfe?.nfeData?.emitente?.cnpj) {
          cnpjEmitenteFinal = String(linkedNfe.nfeData.emitente.cnpj).trim()
        }

        // 8. CNPJ_DESTINATARIO
        let cnpjDestinatarioFinal = ''
        if (cnpjDestinatarioCol !== -1 && row[cnpjDestinatarioCol] !== undefined && row[cnpjDestinatarioCol] !== null && String(row[cnpjDestinatarioCol]).trim() !== '') {
          cnpjDestinatarioFinal = String(row[cnpjDestinatarioCol]).trim()
        } else if (linkedNfe?.parsedData?.destCNPJ) {
          cnpjDestinatarioFinal = String(linkedNfe.parsedData.destCNPJ).trim()
        } else if (linkedNfe?.nfeData?.destinatario?.cpfCnpj) {
          cnpjDestinatarioFinal = String(linkedNfe.nfeData.destinatario.cpfCnpj).trim()
        }

        // 9. NUMERO
        let numeroFinal: any = ''
        if (numeroCol !== -1 && row[numeroCol] !== undefined && row[numeroCol] !== null && String(row[numeroCol]).trim() !== '') {
          numeroFinal = String(row[numeroCol]).trim()
        } else if (linkedNfe?.parsedData?.nNF) {
          numeroFinal = String(linkedNfe.parsedData.nNF).trim()
        } else if (linkedNfe?.nfeData?.numero) {
          numeroFinal = String(linkedNfe.nfeData.numero).trim()
        }

        // 10. CHAVE: extrair os 44 dígitos numéricos puros (limpando "NFe", prefixos e pontuações)
        let chaveFinal = ''
        if (rowKey && rowKey.length === 44) {
          chaveFinal = rowKey
        } else if (linkedNfe) {
          const keyFromNfe = getNormalizedKey(linkedNfe) || linkedNfe.parsedData?.chave
          if (keyFromNfe && keyFromNfe.length === 44) {
            chaveFinal = keyFromNfe
          }
        }
        if (!chaveFinal && chaveCol !== -1 && row[chaveCol] !== undefined && row[chaveCol] !== null) {
          const rawDigits = String(row[chaveCol]).replace(/\D/g, '')
          if (rawDigits.length >= 44) {
            chaveFinal = rawDigits.substring(rawDigits.length - 44)
          } else {
            chaveFinal = rawDigits
          }
        }

        let transbordoFinal = ''
        if (transbordoExcelCol !== -1 && row[transbordoExcelCol] !== undefined && row[transbordoExcelCol] !== null) {
          transbordoFinal = String(row[transbordoExcelCol]).trim()
        }

        digitacaoRows.push({
          'vagao': vagaoFinal,
          'BRUTO': brutoFinal,
          'TARA': taraFinal,
          'data_emissao': dataEmissaoFinal,
          'PESO_SELECIONADO': pesoSelecionadoFinal,
          'PESO_NOTA_VAGAO': pesoNotaVagaoFinal,
          'CNPJ_EMITENTE': cnpjEmitenteFinal,
          'CNPJ_DESTINATARIO': cnpjDestinatarioFinal,
          'NUMERO': numeroFinal,
          'CHAVE': chaveFinal,
          'transbordo do CTe': transbordoFinal,
        })
      }
    })

    return digitacaoRows
  }

  // Exportar exclusivamente a Planilha de Digitação
  const handleExportDigitacaoOnly = () => {
    if (!rawWorkbook) {
      alert('Carregue uma planilha Excel de origem para gerar a Planilha de Digitação.')
      return
    }

    const digitacaoRows = extractDigitacaoRows()
    if (digitacaoRows.length === 0) {
      alert('Nenhum dado encontrado na planilha de origem para gerar a digitação.')
      return
    }

    const wb = XLSX.utils.book_new()
    const wsDigitacao = createFormattedWorksheet(digitacaoRows)
    XLSX.utils.book_append_sheet(wb, wsDigitacao, 'Planilha de Digitação')
    XLSX.writeFile(wb, `planilha_digitacao_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Exportar Relatório Consolidado de Conferência em Excel com Múltiplas Abas
  const handleExportReconciliationReport = () => {
    if (!excelData && validConvertedResults.length === 0) {
      alert('Carregue notas e/ou uma planilha Excel para gerar o relatório de conferência.')
      return
    }

    const wb = XLSX.utils.book_new()

    // 1. ABA RESUMO GERAL / DASHBOARD
    const totalFilesCount = validConvertedResults.length
    const matchedCount = matchedResults.length
    const unmatchedCount = unmatchedResults.length
    const totalExcelKeys = excelData ? excelData.allKeysList.length : 0
    const missingFilesCount = excelKeysWithoutFiles.length
    const matchPercentage = totalFilesCount > 0 ? Math.round((matchedCount / totalFilesCount) * 100) : 0

    const weightDivergentCount = validConvertedResults.filter((res) => {
      const key = getNormalizedKey(res) || res.parsedData?.chave || ''
      const matchInfo = getExcelMatchInfo(key)
      const qtd = getResultQuantidade(res)
      const vWeight = confrontWeights(matchInfo, qtd)
      return vWeight.status === 'DIVERGENTE'
    }).length

    const weightMatchedCount = validConvertedResults.filter((res) => {
      const key = getNormalizedKey(res) || res.parsedData?.chave || ''
      const matchInfo = getExcelMatchInfo(key)
      const qtd = getResultQuantidade(res)
      const vWeight = confrontWeights(matchInfo, qtd)
      return vWeight.status === 'CONFERE'
    }).length

    const summaryRows = [
      { 'Métrica / Indicador': 'Data e Hora da Conferência', 'Valor / Detalhe': new Date().toLocaleString('pt-BR') },
      { 'Métrica / Indicador': 'Planilha Excel de Origem', 'Valor / Detalhe': excelData?.fileName || 'Nenhuma planilha informada' },
      { 'Métrica / Indicador': 'Modo de Operação', 'Valor / Detalhe': subMode === 'pdf-to-xml' ? 'PDF para XML (DANFE)' : 'XML para PDF (DANFE)' },
      { 'Métrica / Indicador': 'Total de Arquivos Importados (PDF/XML)', 'Valor / Detalhe': totalFilesCount },
      { 'Métrica / Indicador': 'Notas ENCONTRADAS na Planilha Excel', 'Valor / Detalhe': matchedCount },
      { 'Métrica / Indicador': 'Notas AUSENTES na Planilha Excel', 'Valor / Detalhe': unmatchedCount },
      { 'Métrica / Indicador': 'Total de Vagões Únicos Consolidados', 'Valor / Detalhe': excelData?.wagonSummaries?.length || 0 },
      { 'Métrica / Indicador': 'Notas com PESO CONFERIDO (Excel x Nota)', 'Valor / Detalhe': weightMatchedCount },
      { 'Métrica / Indicador': 'Notas com DIVERGÊNCIA DE PESO (Excel x Nota)', 'Valor / Detalhe': weightDivergentCount },
      { 'Métrica / Indicador': 'Total de Chaves de Acesso na Planilha Excel', 'Valor / Detalhe': totalExcelKeys },
      { 'Métrica / Indicador': 'Chaves no Excel Faltando Arquivo de Nota', 'Valor / Detalhe': missingFilesCount },
      { 'Métrica / Indicador': 'Taxa de Batimento / Batimento (%)', 'Valor / Detalhe': `${matchPercentage}%` },
    ]
    const wsSummary = createFormattedWorksheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Geral')

    // 2. ABA PLANILHA DE DIGITAÇÃO (SEQUÊNCIA ORIGINAL COMPLETA SEM REMOVER DUPLICADAS)
    if (rawWorkbook) {
      const digitacaoRows = extractDigitacaoRows()
      if (digitacaoRows.length > 0) {
        const wsDigitacao = createFormattedWorksheet(digitacaoRows)
        XLSX.utils.book_append_sheet(wb, wsDigitacao, 'Planilha de Digitação')
      }
    }

    // 3. ABA CONSOLIDAÇÃO POR VAGÃO (CÁLCULO TOTAL: SOMA DE PESO_NOTA_VAGAO + TARA)
    if (excelData && excelData.wagonSummaries && excelData.wagonSummaries.length > 0) {
      const wagonExportRows = excelData.wagonSummaries.map((w) => ({
        'Vagão': w.vagao,
        'Aba / Planilha de Origem': w.sheetName,
        'Qtd de Notas / Linhas no Vagão': w.qtdNotas,
        'Soma Total PESO_NOTA_VAGAO (kg/t)': w.somaPesoNotaVagaoStr,
        'Tara Única do Vagão (kg/t)': w.taraStr,
        'PESO BRUTO TOTAL DO VAGÃO (Soma + Tara)': w.pesoBrutoTotalStr,
        'Posição / Linhas no Excel': w.linhas,
      }))
      const wsWagons = createFormattedWorksheet(wagonExportRows)
      XLSX.utils.book_append_sheet(wb, wsWagons, 'Consolidação por Vagão')
    }

    // 4. ABA TOTAL DE ARQUIVOS (ORDENADOS CONFORME A ORDEM DAS LINHAS DA PLANILHA EXCEL)
    let rowsTotalOrdered: any[] = []

    if (excelData && excelData.allRowsList && excelData.allRowsList.length > 0) {
      // Indexar arquivos por chave
      const filesByKey = new Map<string, any>()
      validConvertedResults.forEach((res) => {
        const k = getNormalizedKey(res)
        if (k) {
          filesByKey.set(k, res)
          if (k.length === 43) filesByKey.set('0' + k, res)
          if (k.length === 44 && k.startsWith('0')) filesByKey.set(k.substring(1), res)
        }
      })

      const matchedFilesSet = new Set<any>()

      // 1. Percorrer TODAS as linhas da planilha Excel na sequência original
      excelData.allRowsList.forEach((rowRec) => {
        const resMatch = rowRec.key ? filesByKey.get(rowRec.key) : null

        if (resMatch) {
          matchedFilesSet.add(resMatch)
          const d = resMatch.parsedData
          const key = getNormalizedKey(resMatch)
          const matchInfo = getExcelMatchInfo(key) || {
            row: rowRec.row,
            rawValue: rowRec.rawValue || '',
            sheetName: rowRec.sheetName,
            pesoSelecionado: rowRec.pesoSelecionado,
            pesoSelecionadoStr: rowRec.pesoSelecionadoStr,
            pesoNotaVagao: rowRec.pesoNotaVagao,
            pesoNotaVagaoStr: rowRec.pesoNotaVagaoStr,
            tara: rowRec.tara,
            taraStr: rowRec.taraStr,
            vagao: rowRec.vagao,
            pesoBruto: rowRec.pesoBruto,
            pesoBrutoStr: rowRec.pesoBrutoStr,
          }

          const destCNPJ = d?.destCNPJ || resMatch.nfeData?.destinatario?.cpfCnpj || ''
          const vCNPJ = verifyChaveCNPJ(key || d?.chave || '', d?.emitCNPJ || resMatch.nfeData?.emitente?.cnpj || '', destCNPJ)
          const qtdNota = getResultQuantidade(resMatch)
          const vWeight = confrontWeights(matchInfo, qtdNota)
          const itemAudit = auditResultsMap[key || resMatch.fileName]
          const pesoIaEncontrado = itemAudit?.pesoCorrigidoDoc !== undefined && itemAudit?.pesoCorrigidoDoc !== null
            ? itemAudit.pesoCorrigidoDoc
            : (overrideWeightsMap[key || resMatch.fileName] !== undefined ? overrideWeightsMap[key || resMatch.fileName] : qtdNota)

          rowsTotalOrdered.push({
            'Posição / Linha Excel': `Linha ${rowRec.row} (${rowRec.sheetName})`,
            'Status Conferência Excel': 'CONSTA NA PLANILHA',
            'Vagão (Excel)': rowRec.vagao || matchInfo?.vagao || 'N/A',
            'Chave de Acesso': key || d?.chave || rowRec.key || '',
            'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
            'Destinatário CNPJ': destCNPJ,
            'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
            'Validação CNPJ': vCNPJ.statusLabel,
            'Nº Nota (nNF)': d?.nNF || resMatch.nfeData?.numero || '',
            'Série': d?.serie || resMatch.nfeData?.serie || '',
            'Peso Selecionado (Excel)': vWeight.pesoExcelStr,
            'Peso Nota Vagão (Excel)': rowRec.pesoNotaVagaoStr || matchInfo?.pesoNotaVagaoStr || 'N/A',
            'Tara (Excel)': rowRec.taraStr || matchInfo?.taraStr || 'N/A',
            'Peso Bruto do Vagão (Soma Rateios + Tara)': rowRec.pesoBrutoStr || matchInfo?.pesoBrutoStr || 'N/A',
            'Quantidade Extraída (Nota)': qtdNota,
            'Confronto Peso (Excel vs Nota)': vWeight.statusLabel,
            'Diferença de Peso (Excel - Nota)': vWeight.pesoExcel !== null ? vWeight.diferenca : 'N/A',
            'Quantidade Encontrada pela IA (Valor Real)': pesoIaEncontrado,
            'Auditoria IA (Status / Causa)': itemAudit?.status === 'ERRO_LEITURA_SISTEMA' 
              ? 'ERRO DE LEITURA DO SISTEMA (VALOR REAL ENCONTRADO)' 
              : itemAudit?.status === 'DIVERGENCIA_REAL' 
                ? 'DIVERGÊNCIA REAL DE PESAGEM' 
                : itemAudit?.status === 'CONFERIDO_CORRETO' 
                  ? 'PESO CONFERIDO CORRETO' 
                  : (vWeight.status === 'DIVERGENTE' ? 'Divergência não auditada pela IA' : 'PESO CORRETO / CONFERIDO'),
            'Explicação IA': itemAudit?.explicacao || '',
            'Valor Total (R$)': d?.vNF || 0,
            'Emitente': d?.emitNome || '',
            'CNPJ Emitente': d?.emitCNPJ || '',
            'Destinatário': d?.destNome || '',
            'Nome do Arquivo': resMatch.fileName,
            'Tipo Documento': subMode === 'pdf-to-xml' ? 'PDF' : 'XML',
          })
        } else {
          // LINHA DA PLANILHA EXCEL SEM ARQUIVO CORRESPONDENTE CARREGADO
          const cleanKey = rowRec.key || ''
          const cnpjFromKey = cleanKey.length === 44 ? cleanKey.substring(6, 20) : 'N/A'
          const numFromKey = cleanKey.length === 44 ? (cleanKey.substring(25, 34).replace(/^0+/, '') || 'N/A') : 'N/A'
          const serieFromKey = cleanKey.length === 44 ? (cleanKey.substring(22, 25).replace(/^0+/, '') || 'N/A') : 'N/A'

          rowsTotalOrdered.push({
            'Posição / Linha Excel': `Linha ${rowRec.row} (${rowRec.sheetName})`,
            'Status Conferência Excel': cleanKey ? 'NÃO ENCONTRADO NOS ARQUIVOS (CONSTA APENAS NO EXCEL)' : 'SEM CHAVE NA LINHA DO EXCEL (NÃO ENCONTRADO NOS ARQUIVOS)',
            'Vagão (Excel)': rowRec.vagao || 'N/A',
            'Chave de Acesso': cleanKey || 'SEM CHAVE NA LINHA',
            'CNPJ na Chave': cnpjFromKey,
            'Destinatário CNPJ': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Confronto (Chave vs Destinatário)': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Validação CNPJ': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Nº Nota (nNF)': numFromKey !== 'N/A' ? numFromKey : 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Série': serieFromKey !== 'N/A' ? serieFromKey : 'N/A',
            'Peso Selecionado (Excel)': rowRec.pesoSelecionadoStr || 'N/A',
            'Peso Nota Vagão (Excel)': rowRec.pesoNotaVagaoStr || 'N/A',
            'Tara (Excel)': rowRec.taraStr || 'N/A',
            'Peso Bruto do Vagão (Soma Rateios + Tara)': rowRec.pesoBrutoStr || 'N/A',
            'Quantidade Extraída (Nota)': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Confronto Peso (Excel vs Nota)': cleanKey ? 'ARQUIVO NÃO ENCONTRADO / AUSENTE' : 'SEM CHAVE / ARQUIVO AUSENTE',
            'Diferença de Peso (Excel - Nota)': 'N/A',
            'Quantidade Encontrada pela IA (Valor Real)': 'N/A (Sem arquivo)',
            'Auditoria IA (Status / Causa)': cleanKey ? 'ARQUIVO NÃO CARREGADO / NOTA NÃO ENCONTRADA' : 'LINHA SEM CHAVE DE ACESSO NO EXCEL',
            'Explicação IA': cleanKey
              ? 'Esta linha consta na planilha Excel, porém o arquivo correspondente (PDF/XML) não foi carregado para conferência.'
              : 'Linha presente na planilha Excel sem chave de acesso de 44 dígitos identificada.',
            'Valor Total (R$)': 0,
            'Emitente': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'CNPJ Emitente': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Destinatário': 'NÃO ENCONTRADO NOS ARQUIVOS',
            'Nome do Arquivo': 'ARQUIVO NÃO CARREGADO NO SISTEMA',
            'Tipo Documento': 'N/A',
          })
        }
      })

      // 2. Adicionar arquivos carregados que NÃO constam na planilha Excel
      validConvertedResults.forEach((res) => {
        if (!matchedFilesSet.has(res)) {
          const d = res.parsedData
          const key = getNormalizedKey(res)
          const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
          const vCNPJ = verifyChaveCNPJ(key || d?.chave || '', d?.emitCNPJ || res.nfeData?.emitente?.cnpj || '', destCNPJ)
          const qtdNota = getResultQuantidade(res)

          rowsTotalOrdered.push({
            'Posição / Linha Excel': 'Fora da Planilha Excel',
            'Status Conferência Excel': 'NÃO CONSTA NA PLANILHA',
            'Vagão (Excel)': 'N/A',
            'Chave de Acesso': key || d?.chave || '',
            'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
            'Destinatário CNPJ': destCNPJ,
            'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
            'Validação CNPJ': vCNPJ.statusLabel,
            'Nº Nota (nNF)': d?.nNF || '',
            'Série': d?.serie || '',
            'Peso Selecionado (Excel)': 'N/A',
            'Peso Nota Vagão (Excel)': 'N/A',
            'Tara (Excel)': 'N/A',
            'Peso Bruto do Vagão (Soma Rateios + Tara)': 'N/A',
            'Quantidade Extraída (Nota)': qtdNota,
            'Confronto Peso (Excel vs Nota)': 'NÃO CONSTA NA PLANILHA',
            'Diferença de Peso (Excel - Nota)': 'N/A',
            'Quantidade Encontrada pela IA (Valor Real)': 'N/A',
            'Auditoria IA (Status / Causa)': 'ARQUIVO CARREGADO NÃO CONSTA NO EXCEL',
            'Explicação IA': 'Arquivo presente nos documentos importados, porém a chave não foi localizada na planilha Excel.',
            'Valor Total (R$)': d?.vNF || 0,
            'Emitente': d?.emitNome || '',
            'CNPJ Emitente': d?.emitCNPJ || '',
            'Destinatário': d?.destNome || '',
            'Nome do Arquivo': res.fileName,
            'Tipo Documento': subMode === 'pdf-to-xml' ? 'PDF' : 'XML',
          })
        }
      })
    } else {
      // Caso não haja planilha Excel carregada
      const orderedAllResults = [...validConvertedResults].sort((a, b) => {
        const keyA = getNormalizedKey(a)
        const keyB = getNormalizedKey(b)
        return keyA.localeCompare(keyB)
      })

      rowsTotalOrdered = orderedAllResults.map((res) => {
        const d = res.parsedData
        const key = getNormalizedKey(res)
        const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
        const vCNPJ = verifyChaveCNPJ(key || d?.chave || '', d?.emitCNPJ || res.nfeData?.emitente?.cnpj || '', destCNPJ)
        const qtdNota = getResultQuantidade(res)

        return {
          'Posição / Linha Excel': 'Fora da Planilha Excel',
          'Status Conferência Excel': 'SEM PLANILHA EXCEL',
          'Vagão (Excel)': 'N/A',
          'Chave de Acesso': key || d?.chave || '',
          'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
          'Destinatário CNPJ': destCNPJ,
          'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
          'Validação CNPJ': vCNPJ.statusLabel,
          'Nº Nota (nNF)': d?.nNF || '',
          'Série': d?.serie || '',
          'Peso Selecionado (Excel)': 'N/A',
          'Peso Nota Vagão (Excel)': 'N/A',
          'Tara (Excel)': 'N/A',
          'Peso Bruto do Vagão (Soma Rateios + Tara)': 'N/A',
          'Quantidade Extraída (Nota)': qtdNota,
          'Confronto Peso (Excel vs Nota)': 'SEM PLANILHA',
          'Diferença de Peso (Excel - Nota)': 'N/A',
          'Quantidade Encontrada pela IA (Valor Real)': 'N/A',
          'Auditoria IA (Status / Causa)': 'Sem planilha Excel carregada',
          'Explicação IA': '',
          'Valor Total (R$)': d?.vNF || 0,
          'Emitente': d?.emitNome || '',
          'CNPJ Emitente': d?.emitCNPJ || '',
          'Destinatário': d?.destNome || '',
          'Nome do Arquivo': res.fileName,
          'Tipo Documento': subMode === 'pdf-to-xml' ? 'PDF' : 'XML',
        }
      })
    }
    const wsTotalOrdered = createFormattedWorksheet(rowsTotalOrdered)
    XLSX.utils.book_append_sheet(wb, wsTotalOrdered, 'Total Arquivos (Ord. Excel)')

    // 3. ABA NOTAS ENCONTRADAS NA PLANILHA EXCEL
    const orderedMatchedResults = [...matchedResults].sort((a, b) => {
      const keyA = getNormalizedKey(a)
      const keyB = getNormalizedKey(b)
      const rowA = getExcelMatchInfo(keyA)?.row ?? 9999999
      const rowB = getExcelMatchInfo(keyB)?.row ?? 9999999
      return rowA - rowB
    })

    const rowsMatched = orderedMatchedResults.map((res) => {
      const d = res.parsedData
      const key = getNormalizedKey(res)
      const matchInfo = getExcelMatchInfo(key)
      const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
      const vCNPJ = verifyChaveCNPJ(key || d?.chave || '', d?.emitCNPJ || res.nfeData?.emitente?.cnpj || '', destCNPJ)
      const qtdNota = getResultQuantidade(res)
      const vWeight = confrontWeights(matchInfo, qtdNota)
      const itemAudit = auditResultsMap[key || res.fileName]
      const pesoIaEncontrado = itemAudit?.pesoCorrigidoDoc !== undefined && itemAudit?.pesoCorrigidoDoc !== null
        ? itemAudit.pesoCorrigidoDoc
        : (overrideWeightsMap[key || res.fileName] !== undefined ? overrideWeightsMap[key || res.fileName] : qtdNota)

      return {
        'Linha no Excel': matchInfo ? `Linha ${matchInfo.row}` : 'N/A',
        'Aba no Excel': matchInfo?.sheetName || '',
        'Status Conferência': 'CONSTA NA PLANILHA EXCEL',
        'Vagão (Excel)': matchInfo?.vagao || 'N/A',
        'Chave de Acesso': key || d?.chave || '',
        'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
        'Destinatário CNPJ': destCNPJ,
        'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
        'Validação CNPJ': vCNPJ.statusLabel,
        'Nº Nota (nNF)': d?.nNF || '',
        'Série': d?.serie || '',
        'Peso Selecionado (Excel)': vWeight.pesoExcelStr,
        'Peso Nota Vagão (Excel)': matchInfo?.pesoNotaVagaoStr || 'N/A',
        'Tara (Excel)': matchInfo?.taraStr || 'N/A',
        'Peso Bruto do Vagão (Soma Rateios + Tara)': matchInfo?.pesoBrutoStr || (matchInfo?.tara && matchInfo?.pesoNotaVagao ? (matchInfo.tara + matchInfo.pesoNotaVagao).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : 'N/A'),
        'Quantidade Extraída (Nota)': qtdNota,
        'Confronto Peso (Excel vs Nota)': vWeight.statusLabel,
        'Diferença de Peso (Excel - Nota)': vWeight.pesoExcel !== null ? vWeight.diferenca : 'N/A',
        'Quantidade Encontrada pela IA (Valor Real)': pesoIaEncontrado,
        'Auditoria IA (Status / Causa)': itemAudit?.status === 'ERRO_LEITURA_SISTEMA' 
          ? 'ERRO DE LEITURA DO SISTEMA (VALOR REAL ENCONTRADO)' 
          : itemAudit?.status === 'DIVERGENCIA_REAL' 
            ? 'DIVERGÊNCIA REAL DE PESAGEM' 
            : itemAudit?.status === 'CONFERIDO_CORRETO' 
              ? 'PESO CONFERIDO CORRETO' 
              : (vWeight.status === 'DIVERGENTE' ? 'Divergência não auditada pela IA' : 'PESO CORRETO / CONFERIDO'),
        'Explicação IA': itemAudit?.explicacao || '',
        'Valor Total (R$)': d?.vNF || 0,
        'Emitente': d?.emitNome || '',
        'CNPJ Emitente': d?.emitCNPJ || '',
        'Destinatário': d?.destNome || '',
        'Nome do Arquivo': res.fileName,
        'Tipo Documento': subMode === 'pdf-to-xml' ? 'PDF' : 'XML',
      }
    })
    const wsMatched = createFormattedWorksheet(rowsMatched)
    XLSX.utils.book_append_sheet(wb, wsMatched, 'Notas Encontradas')

    // 4. ABA NOTAS QUE NÃO CONSTAM NA PLANILHA EXCEL
    const rowsUnmatched = unmatchedResults.map((res) => {
      const d = res.parsedData
      const key = getNormalizedKey(res)
      const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
      const vCNPJ = verifyChaveCNPJ(key || d?.chave || '', d?.emitCNPJ || res.nfeData?.emitente?.cnpj || '', destCNPJ)
      const qtdNota = getResultQuantidade(res)

      return {
        'Status Conferência': 'NÃO CONSTA NA PLANILHA EXCEL',
        'Chave de Acesso': key || d?.chave || '',
        'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
        'Destinatário CNPJ': destCNPJ,
        'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
        'Validação CNPJ': vCNPJ.statusLabel,
        'Nº Nota (nNF)': d?.nNF || '',
        'Série': d?.serie || '',
        'Quantidade Extraída (Nota)': qtdNota,
        'Valor Total (R$)': d?.vNF || 0,
        'Emitente': d?.emitNome || '',
        'CNPJ Emitente': d?.emitCNPJ || '',
        'Destinatário': d?.destNome || '',
        'Nome do Arquivo': res.fileName,
        'Tipo Documento': subMode === 'pdf-to-xml' ? 'PDF' : 'XML',
        'Observação': 'Nota fiscal importada mas a chave de acesso não foi encontrada na planilha Excel',
      }
    })
    const wsUnmatched = createFormattedWorksheet(rowsUnmatched)
    XLSX.utils.book_append_sheet(wb, wsUnmatched, 'Notas Ausentes no Excel')

    // 5. ABA CHAVES / LINHAS NA PLANILHA EXCEL SEM ARQUIVO CORRESPONDENTE (SEMPRE GERADA)
    if (excelData) {
      const rowsExcelOnly = excelRowsWithoutFiles.map((rowRec) => {
        const cleanKey = rowRec.key || ''
        const matchInfo = cleanKey ? getExcelMatchInfo(cleanKey) : null
        const isMissingFile = !!cleanKey
        return {
          'Linha no Excel': `Linha ${rowRec.row}`,
          'Aba no Excel': rowRec.sheetName,
          'Chave de Acesso (Excel)': cleanKey || 'SEM CHAVE NA LINHA',
          'Vagão (Excel)': rowRec.vagao || matchInfo?.vagao || 'N/A',
          'Peso Selecionado (Excel)': rowRec.pesoSelecionadoStr || matchInfo?.pesoSelecionadoStr || 'N/A',
          'Peso Nota Vagão (Excel)': rowRec.pesoNotaVagaoStr || matchInfo?.pesoNotaVagaoStr || 'N/A',
          'Tara (Excel)': rowRec.taraStr || matchInfo?.taraStr || 'N/A',
          'Peso Bruto do Vagão': rowRec.pesoBrutoStr || matchInfo?.pesoBrutoStr || 'N/A',
          'Conteúdo Original Célula': rowRec.rawValue || matchInfo?.rawValue || '',
          'Status': isMissingFile ? 'FALTANDO ARQUIVO DE NOTA (PDF/XML)' : 'LINHA NO EXCEL SEM CHAVE DE ACESSO',
          'Observação': isMissingFile
            ? 'Chave de 44 dígitos consta na planilha Excel, porém nenhum arquivo correspondente foi importado'
            : 'Linha presente na planilha Excel sem chave de acesso de 44 dígitos identificada',
        }
      })

      // Se todas as notas estiverem 100% presentes, exibe uma linha informativa clara
      if (rowsExcelOnly.length === 0) {
        rowsExcelOnly.push({
          'Linha no Excel': 'Nenhuma pendência',
          'Aba no Excel': '-',
          'Chave de Acesso (Excel)': '-',
          'Vagão (Excel)': '-',
          'Peso Selecionado (Excel)': '-',
          'Peso Nota Vagão (Excel)': '-',
          'Tara (Excel)': '-',
          'Peso Bruto do Vagão': '-',
          'Conteúdo Original Célula': '-',
          'Status': 'TODAS AS CHAVES FORAM ENCONTRADAS (100% CONFERIDO)',
          'Observação': 'Todos os arquivos correspondentes às chaves da planilha Excel foram carregados com sucesso.',
        })
      }
      const wsExcelOnly = createFormattedWorksheet(rowsExcelOnly)
      XLSX.utils.book_append_sheet(wb, wsExcelOnly, 'Chaves Excel Sem Arquivo')
    }

    XLSX.writeFile(wb, `relatorio_conferencia_chaves_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const successCount = results.filter(r => r.parsedData || r.xmlContent).length
  const processingCount = results.filter(r => r.isProcessing).length
  const errorCount = results.filter(r => r.error).length
  const progressPercent = results.length > 0 ? Math.round(((successCount + errorCount) / results.length) * 100) : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-zinc-100 dark:border-zinc-800">
            <div>
              <CardTitle className="text-xl flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
                Conversor de Documentos Fiscais
              </CardTitle>
              <CardDescription className="mt-1">
                {subMode === 'pdf-to-xml'
                  ? 'Arraste PDFs de DANFE para extrair o XML das notas fiscais e conferir com sua planilha Excel.'
                  : 'Arraste arquivos XML ou ZIPs contendo notas fiscais para gerar o DANFE em PDF e conferir com sua planilha Excel.'}
              </CardDescription>
            </div>

            {/* Alternador de Sub-Opções: PDF -> XML vs XML -> PDF */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="inline-flex bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setSubMode('pdf-to-xml')
                    setResults([])
                  }}
                  className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    subMode === 'pdf-to-xml'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-50 font-bold'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  <FileText className="h-4 w-4 text-indigo-500" />
                  PDF ➔ XML (DANFE)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubMode('xml-to-pdf')
                    setResults([])
                  }}
                  className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    subMode === 'xml-to-pdf'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-50 font-bold'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  <FileCode className="h-4 w-4 text-emerald-500" />
                  XML ➔ PDF (DANFE)
                </button>
              </div>

              {/* Controles de Alerta por Voz */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleVoiceAlert(!voiceAlertEnabled)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                    voiceAlertEnabled
                      ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800 hover:bg-amber-100'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 hover:bg-zinc-200'
                  }`}
                  title={voiceAlertEnabled ? 'Clique para desativar a notificação por voz' : 'Clique para ativar a notificação por voz'}
                >
                  {voiceAlertEnabled ? (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-pulse shrink-0" />
                      <span>Voz de Alerta: <strong className="font-extrabold text-amber-700 dark:text-amber-300">ATIVADA</strong></span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span>Voz de Alerta: <strong className="font-bold text-zinc-500">DESATIVADA</strong></span>
                    </>
                  )}
                </button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => speakText('Teste da função de áudio e voz. O sistema emitirá este aviso sonoro sempre que o CNPJ da Chave for divergente do Destinatário.')}
                  className="text-xs h-7 px-2.5 gap-1 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Testar sintetizador de voz"
                >
                  <Volume1 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  Testar Voz
                </Button>

                {onOpenDocumentation && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenDocumentation}
                    className="text-xs h-7 px-2.5 gap-1.5 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer"
                    title="Abrir Manual e Guia de Instruções do Sistema"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    Guia de Uso
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/10 dark:border-indigo-400'
                : 'border-zinc-300 hover:border-indigo-400 dark:border-zinc-800'
            }`}
          >
            <div className="rounded-full bg-indigo-50 p-4 text-indigo-500 dark:bg-indigo-950/40 mb-4">
              <Upload className="h-8 w-8 animate-bounce" />
            </div>
            
            <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-base">
              {subMode === 'pdf-to-xml'
                ? 'Arraste e solte arquivos PDF ou várias pastas contendo PDFs aqui'
                : 'Arraste e solte arquivos .XML, pacotes .ZIP ou pastas aqui'}
            </p>
            <p className="text-xs text-zinc-400 mt-1 mb-4 max-w-lg">
              {subMode === 'pdf-to-xml'
                ? 'Suporta arquivos individuais, múltiplos arquivos PDF ou várias pastas/subpastas com PDFs'
                : 'Suporta múltiplos arquivos XML/ZIP ou várias pastas contendo notas fiscais'}
            </p>
            <p className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-1 rounded-full mb-6 max-w-md mx-auto">
              {subMode === 'pdf-to-xml'
                ? 'Varredura automática: extrai e converte todos os PDFs contidos em qualquer pasta ou subpasta.'
                : 'Geração de DANFE Instantânea: XMLs convertidos em relatórios PDF no padrão Sefaz.'}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-lg">
              <div className="w-full">
                <input
                  type="file"
                  id="file-upload-input"
                  ref={fileInputRef}
                  multiple
                  accept={subMode === 'pdf-to-xml' ? '.pdf' : '.xml,.zip'}
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full cursor-pointer border-indigo-200 hover:bg-slate-50 dark:border-indigo-900/40 text-sm py-2 font-medium"
                >
                  {subMode === 'pdf-to-xml' ? (
                    <>
                      <FileText className="mr-2 h-4 w-4 text-indigo-500" />
                      Selecionar Arquivos .PDF
                    </>
                  ) : (
                    <>
                      <FileCode className="mr-2 h-4 w-4 text-emerald-500" />
                      Selecionar Arquivos .XML ou .ZIP
                    </>
                  )}
                </Button>
              </div>

              <div className="w-full">
                <input
                  type="file"
                  id="pdf-folder-upload"
                  ref={folderInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
                />
                <Button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  variant="outline"
                  className="w-full cursor-pointer border-indigo-200 hover:bg-slate-50 dark:border-indigo-900/40 text-sm py-2 font-medium"
                >
                  <Folder className="mr-2 h-4 w-4 text-indigo-500" />
                  {subMode === 'pdf-to-xml' ? 'Selecionar Pasta(s) de PDFs' : 'Selecionar Pasta(s) de XMLs'}
                </Button>
              </div>
            </div>
          </div>

          {results.length > 0 && (
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Progresso do processamento ({successCount + errorCount} de {results.length} concluídos)
                </h4>
                <span className="text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full">
                  {progressPercent}%
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  {successCount > 0 && (
                    <span className="flex items-center gap-1.5 text-green-600 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      {successCount} processado{successCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {processingCount > 0 && (
                    <span className="flex items-center gap-1.5 text-indigo-500 animate-pulse font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {processingCount} processando...
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1.5 text-destructive font-medium">
                      <AlertCircle className="h-4 w-4" />
                      {errorCount} erro{errorCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {successCount > 0 && (
                    <>
                      <Button onClick={handleDownloadAllExcel} size="sm" variant="outline" className="gap-2 border-green-200 dark:border-green-900/40 text-green-600 hover:bg-green-50/55 dark:hover:bg-green-950/20 font-medium cursor-pointer">
                        <FileSpreadsheet className="h-4 w-4 text-green-500" />
                        Baixar Excel (.xlsx)
                      </Button>

                      {subMode === 'pdf-to-xml' ? (
                        <Button onClick={handleDownloadAllXMLZIP} size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium cursor-pointer">
                          <Download className="h-4 w-4" />
                          Baixar Todos XMLs (.ZIP)
                        </Button>
                      ) : (
                        <Button onClick={handleDownloadAllPDFsZIP} size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer">
                          <Download className="h-4 w-4" />
                          Baixar Todos PDFs (.ZIP)
                        </Button>
                      )}
                    </>
                  )}
                  <Button onClick={handleClear} variant="outline" size="sm" title="Limpar lista" className="cursor-pointer">
                    Limpar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dashboard com os gráficos de Destinatário, Terminal de Entrega, Transbordo e Produtos */}
      {results.some((r) => r.nfeData !== null || r.parsedData !== null) && (
        <Card className="border border-zinc-200 dark:border-zinc-800 p-4">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg">Dashboard Geral das Notas Convertidas</CardTitle>
            <CardDescription>Visualização em tempo real por Destinatário, Terminal de Entrega, Transbordo e Produto</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Dashboard files={results.map((r) => ({ fileName: r.fileName, filePath: r.filePath || r.originalPath, originalPath: r.originalPath || r.filePath, nfeData: r.nfeData || null, parsedData: r.parsedData || null, xmlContent: r.xmlContent || undefined, rawSnippet: r.parsedData?.infCpl || undefined }))} />
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* CARD DE CONFERÊNCIA DE CHAVES COM PLANILHA EXCEL                          */}
      {/* ========================================================================= */}
      <Card className="border border-emerald-200 dark:border-emerald-950 shadow-xs">
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800 bg-emerald-50/30 dark:bg-emerald-950/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Conferência de Chaves de Acesso com Planilha Excel
              </CardTitle>
              <CardDescription>
                Insira uma planilha Excel (.xlsx, .xls, .csv) para verificar se as chaves das notas {subMode === 'pdf-to-xml' ? 'convertidas' : 'importadas'} constam no seu controle financeiro/logístico.
              </CardDescription>
            </div>

            {excelData && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleExportDigitacaoOnly}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-100/50 dark:hover:bg-teal-950/40 text-xs font-semibold cursor-pointer"
                  title="Exportar planilha formatada para digitação com Vagão concatenado, Bruto/Tara x1000 e sequência original"
                >
                  <FileSpreadsheet className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Planilha de Digitação (.xlsx)
                </Button>
                <Button
                  onClick={handleExportReconciliationReport}
                  size="sm"
                  variant="outline"
                  className="gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40 text-xs font-semibold cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Baixar Relatório de Conferência (.xlsx)
                </Button>
                <Button
                  onClick={handleRemoveExcel}
                  size="sm"
                  variant="ghost"
                  className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                >
                  <X className="h-4 w-4 mr-1" />
                  Remover Planilha
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Seção para envio do arquivo Excel se ainda não houver nenhum carregado */}
          {!excelData ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleExcelDrop}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-900/60 p-8 text-center bg-emerald-50/20 dark:bg-emerald-950/5 hover:border-emerald-500 transition-all cursor-pointer"
              onClick={() => excelInputRef.current?.click()}
            >
              <input
                type="file"
                ref={excelInputRef}
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleExcelInputChange}
              />
              <div className="rounded-full bg-emerald-100 p-3.5 text-emerald-600 dark:bg-emerald-950/60 mb-3">
                {isExcelLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-7 w-7" />
                )}
              </div>
              <p className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                Clique ou arraste aqui a planilha Excel para conferência das chaves
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-md">
                O sistema identificará de forma automática todas as chaves de acesso (44 dígitos) presentes em qualquer coluna ou linha da sua planilha.
              </p>
            </div>
          ) : (
            <>
              {/* Barra de Status da Planilha Carregada */}
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">
                      Planilha Ativa: {excelData.fileName}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 ml-2">
                      ({excelData.allKeysList.length} chaves de 44 dígitos encontradas em {excelData.totalRows} linhas)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 underline font-medium cursor-pointer"
                  >
                    Trocar planilha
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveExcel}
                    className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 font-medium cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
                <input
                  type="file"
                  ref={excelInputRef}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelInputChange}
                />
              </div>

              {/* Seletor da Coluna de Peso para Comparação (Regra Estrita Sem Fallback) */}
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-900/50 dark:border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      Coluna para Comparação de Peso no Excel:
                    </span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Regra Estrita Ativa:</span> Se o valor não for encontrado na coluna selecionada, o sistema <strong>NÃO</strong> busca em nenhuma outra coluna.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <select
                    value={selectedExcelWeightCol}
                    onChange={(e) => handleExcelWeightColChange(e.target.value)}
                    aria-label="Coluna para comparação de peso no Excel"
                    className="w-full md:w-72 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="auto">🎯 Automático: Procura &quot;Peso Selecionado&quot;</option>
                    <option value="none">🚫 Não comparar peso (apenas chave)</option>
                    {availableExcelColumns.length > 0 && (
                      <optgroup label="Colunas detectadas no Excel">
                        {availableExcelColumns.map((col) => (
                          <option key={col} value={col}>
                            Coluna: {col}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Grid de Métricas de Conferência */}
              {(() => {
                const divergentCount = validConvertedResults.filter((res) => {
                  const d = res.parsedData
                  const key = getNormalizedKey(res) || d?.chave || res.nfeData?.chaveAcesso || ''
                  const emitCnpj = d?.emitCNPJ || res.nfeData?.emitente?.cnpj || ''
                  const destCnpj = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
                  if (!key) return false
                  const v = verifyChaveCNPJ(key, emitCnpj, destCnpj)
                  return v.confrontoChaveXDest === 'DIVERGENTES'
                }).length

                const hasAnyPesoInExcel = Boolean(
                  excelData && (
                    (excelData.keysMap && Array.from(excelData.keysMap.values()).some((k) => k.pesoSelecionado !== undefined && k.pesoSelecionado !== null && k.pesoSelecionado > 0)) ||
                    validConvertedResults.some((res) => {
                      const k = getNormalizedKey(res)
                      const m = getExcelMatchInfo(k)
                      return m && m.pesoSelecionado !== undefined && m.pesoSelecionado !== null && m.pesoSelecionado > 0
                    })
                  )
                )

                return (
                  <div className="space-y-4">
                    {divergentCount > 0 && (
                      <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-rose-200 dark:bg-rose-900/80 p-2 text-rose-700 dark:text-rose-200 animate-pulse shrink-0">
                            <AlertTriangle className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                              <span>ALERTA DE SEGURANÇA FISCAL:</span>
                              <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                                {divergentCount} nota{divergentCount > 1 ? 's' : ''} com CNPJ Divergente
                              </span>
                            </p>
                            <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                              O CNPJ extraído da Chave de Acesso é divergente do CNPJ do Destinatário da Nota Fiscal.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            speakText(
                              `Atenção! Foram encontradas ${divergentCount} notas fiscais com CNPJ da Chave de Acesso divergente do Destinatário.`
                            )
                          }
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs gap-1.5 shrink-0 cursor-pointer"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          Ouvir Alerta por Voz
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
                        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          {subMode === 'pdf-to-xml' ? 'PDFs Convertidos' : 'XMLs Importados'}
                        </p>
                        <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-1">
                          {validConvertedResults.length}
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Notas analisadas neste lote</p>
                      </div>

                      <div className="p-3 rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20">
                        <p className="text-[11px] font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          Encontradas no Excel
                        </p>
                        <p className="text-xl font-black text-green-700 dark:text-green-300 mt-1">
                          {matchedResults.length}
                        </p>
                        <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                          {validConvertedResults.length > 0
                            ? `${Math.round((matchedResults.length / validConvertedResults.length) * 100)}% de confirmação`
                            : '0% de confirmação'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Scale className="h-3.5 w-3.5 text-emerald-600" />
                          Peso Confere
                        </p>
                        <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                          {validConvertedResults.filter((res) => {
                            const k = getNormalizedKey(res)
                            const m = getExcelMatchInfo(k)
                            return m && confrontWeights(m, getResultQuantidade(res)).status === 'CONFERE'
                          }).length}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {!hasAnyPesoInExcel ? 'Sem dados na peso selecionado' : 'Excel x Nota idênticos'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
                        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          Divergência de Peso
                        </p>
                        <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-1">
                          {validConvertedResults.filter((res) => {
                            const k = getNormalizedKey(res)
                            const m = getExcelMatchInfo(k)
                            return m && confrontWeights(m, getResultQuantidade(res)).status === 'DIVERGENTE'
                          }).length}
                        </p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {!hasAnyPesoInExcel ? 'Sem dados na peso selecionado' : 'Peso Excel ≠ Qtd Nota'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
                        <p className="text-[11px] font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                          Ausentes no Excel
                        </p>
                        <p className="text-xl font-black text-red-700 dark:text-red-300 mt-1">
                          {unmatchedResults.length}
                        </p>
                        <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">
                          NÃO constam na planilha
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* BANNER DA IA AUDITORA DE DIVERGÊNCIAS DE PESO (TODAS AS NOTAS) */}
              {(() => {
                const divergentItems = validConvertedResults.filter((res) => {
                  const k = getNormalizedKey(res)
                  const m = getExcelMatchInfo(k)
                  return m && confrontWeights(m, getResultQuantidade(res)).status === 'DIVERGENTE'
                })

                if (divergentItems.length === 0) return null

                return (
                  <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-gradient-to-r from-purple-50/80 via-indigo-50/40 to-purple-50/80 dark:from-purple-950/30 dark:via-indigo-950/20 dark:to-purple-950/30 p-4 space-y-3 shadow-xs">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-600 text-white shadow-xs">
                            <Bot className="h-3.5 w-3.5" />
                            IA Auditora de Divergências de Peso
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/50 px-2 py-0.5 rounded-md">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                            Conferência Total de Todas as Notas
                          </span>
                          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                            • {divergentItems.length} notas fiscais com divergência apontada
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300">
                          A IA confere todas as notas divergentes para achar o <strong>valor real da quantidade/peso</strong> e verificar se foi <strong>erro de leitura do sistema</strong> (ex: recorte de decimais no PDF) ou <strong>divergência comercial real</strong>.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          onClick={handleAuditAllNfeWeights}
                          disabled={isAuditingAllWeights}
                          className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          {isAuditingAllWeights ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Auditando todas as {divergentItems.length} notas...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              Conferir Todas com IA ({divergentItems.length})
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {auditSummary && (
                      <div className="pt-2 border-t border-purple-200/80 dark:border-purple-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                            <BrainCircuit className="h-3.5 w-3.5 text-purple-600" />
                            Veredito IA:
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-semibold text-[11px]">
                            {auditSummary.totalErrosLeitura} Erros de Leitura (Valor Real Encontrado)
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-semibold text-[11px]">
                            {auditSummary.totalDivergenciasReais} Divergências Reais
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[11px]">
                            {auditSummary.totalConferidos} Pesos Corretos
                          </span>
                        </div>

                        {auditSummary.totalErrosLeitura > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleApplyAllNfeCorrections}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer h-7 px-3 flex items-center gap-1 self-start sm:self-auto"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Aplicar Valores Reais ({auditSummary.totalErrosLeitura})
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setExcelFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      excelFilter === 'all'
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
                    }`}
                  >
                    Todas ({validConvertedResults.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setExcelFilter('matched')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                      excelFilter === 'matched'
                        ? 'bg-green-600 text-white shadow-xs'
                        : 'text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Encontradas ({matchedResults.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setExcelFilter('weight_divergent')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                      excelFilter === 'weight_divergent'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30'
                    }`}
                  >
                    <Scale className="h-3.5 w-3.5" />
                    Divergência Peso ({
                      validConvertedResults.filter((res) => {
                        const k = getNormalizedKey(res)
                        const m = getExcelMatchInfo(k)
                        return m && confrontWeights(m, getResultQuantidade(res)).status === 'DIVERGENTE'
                      }).length
                    })
                  </button>

                  <button
                    type="button"
                    onClick={() => setExcelFilter('unmatched')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                      excelFilter === 'unmatched'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                    }`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Ausentes ({unmatchedResults.length})
                  </button>

                  {excelKeysWithoutFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExcelFilter('excel_only')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                        excelFilter === 'excel_only'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30'
                      }`}
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      No Excel sem Arquivo ({excelKeysWithoutFiles.length})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  {(() => {
                    const divergentCount = validConvertedResults.filter((res) => {
                      const k = getNormalizedKey(res)
                      const m = getExcelMatchInfo(k)
                      return m && confrontWeights(m, getResultQuantidade(res)).status === 'DIVERGENTE'
                    }).length
                    if (divergentCount === 0) return null

                    return (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAuditAllNfeWeights}
                        disabled={isAuditingAllWeights}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer h-8 px-3 shrink-0"
                      >
                        {isAuditingAllWeights ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Auditando {divergentCount} notas...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            Auditar Todas com IA ({divergentCount})
                          </>
                        )}
                      </Button>
                    )
                  })()}

                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar chave, nº nota..."
                      value={excelSearchQuery}
                      onChange={(e) => setExcelSearchQuery(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Tabela de Resultados do Confronto */}
              {excelFilter === 'excel_only' ? (
                // Exibição de chaves que estão no Excel mas NÃO possuem arquivo correspondente
                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 overflow-hidden bg-indigo-50/20 dark:bg-indigo-950/10">
                  <div className="p-3 bg-indigo-100/50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-900/50 flex items-center justify-between">
                    <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                      <FileQuestion className="h-4 w-4 text-indigo-600" />
                      Chaves de Acesso na planilha Excel sem arquivo correspondente ({excelKeysWithoutFiles.length})
                    </p>
                  </div>
                  <div className="divide-y divide-indigo-100 dark:divide-indigo-900/30 max-h-96 overflow-y-auto">
                    {excelKeysWithoutFiles.map((key, idx) => {
                      const matchInfo = getExcelMatchInfo(key)
                      return (
                        <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                              <span>{key}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(key)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                                title="Copiar chave"
                              >
                                {copiedKey === key ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <p className="text-[11px] text-zinc-500">
                              Encontrada na <span className="font-semibold">{matchInfo?.sheetName || 'Planilha'}</span> (Linha {matchInfo?.row})
                              {matchInfo?.pesoSelecionadoStr && (
                                <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">
                                  | Peso Excel: {matchInfo.pesoSelecionadoStr}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 self-start sm:self-auto">
                            Arquivo Faltante / Não Processado
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : filteredConvertedResults.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <FileQuestion className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                    Nenhum resultado encontrado para o filtro selecionado.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  {excelFilter === 'weight_divergent' && (
                    <div className="p-3 bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <Scale className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Exibindo todas as {filteredConvertedResults.length} notas com divergência de peso
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAuditAllNfeWeights}
                          disabled={isAuditingAllWeights}
                          className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer h-7 px-2.5"
                        >
                          {isAuditingAllWeights ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Auditando todas...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              Auditar Todas com IA ({filteredConvertedResults.length})
                            </>
                          )}
                        </Button>

                        {auditSummary && auditSummary.totalErrosLeitura > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleApplyAllNfeCorrections}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer h-7 px-2.5 flex items-center gap-1"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Aplicar Todas as Correções ({auditSummary.totalErrosLeitura})
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {filteredConvertedResults.map((res, idx) => {
                    const key = getNormalizedKey(res) || res.parsedData?.chave || res.nfeData?.chaveAcesso || ''
                    const matchInfo = getExcelMatchInfo(key)
                    const isMatched = !!matchInfo
                    const d = res.parsedData
                    const emitCnpj = d?.emitCNPJ || res.nfeData?.emitente?.cnpj || ''
                    const destCnpj = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
                    const vCNPJ = verifyChaveCNPJ(key, emitCnpj, destCnpj)
                    const qtdNota = getResultQuantidade(res)
                    const vWeight = confrontWeights(matchInfo, qtdNota)

                    return (
                      <div
                        key={idx}
                        className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                          isMatched
                            ? 'bg-green-50/20 dark:bg-green-950/5 hover:bg-green-50/40'
                            : 'bg-red-50/20 dark:bg-red-950/5 hover:bg-red-50/40'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {isMatched ? (
                            <div className="rounded-full bg-green-100 p-2 text-green-700 dark:bg-green-950/60 dark:text-green-400 shrink-0 mt-0.5">
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                          ) : (
                            <div className="rounded-full bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-400 shrink-0 mt-0.5">
                              <XCircle className="h-5 w-5" />
                            </div>
                          )}

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                  isMatched
                                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                }`}
                              >
                                {isMatched
                                  ? `CONSTA NA PLANILHA (Linha ${matchInfo?.row})`
                                  : 'NÃO CONSTA NA PLANILHA'}
                              </span>

                              {isMatched && (
                                <span
                                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                    vWeight.status === 'CONFERE'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : vWeight.status === 'DIVERGENTE'
                                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300'
                                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                  }`}
                                  title={vWeight.detalhes}
                                >
                                  <Scale className="h-3 w-3" />
                                  {vWeight.status === 'CONFERE'
                                    ? `PESO OK (${vWeight.pesoExcelStr})`
                                    : vWeight.status === 'DIVERGENTE'
                                    ? `DIVERGÊNCIA PESO (Excel: ${vWeight.pesoExcelStr} vs Nota: ${vWeight.qtdNota})`
                                    : 'PESO EXCEL S/ DADO'}
                                </span>
                              )}

                              {vCNPJ.chaveCnpjRaw && (
                                <span
                                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                    vCNPJ.isValid
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                  title={vCNPJ.details}
                                >
                                  {vCNPJ.isValid ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-rose-600" />}
                                  {vCNPJ.statusLabel}
                                </span>
                              )}

                              {vCNPJ.confrontoChaveXDest === 'DIVERGENTES' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    speakText(
                                      `Atenção! CNPJ da Chave é divergente do Destinatário na nota fiscal ${
                                        d?.nNF || res.fileName
                                      }. ${vCNPJ.details}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-200 text-rose-900 hover:bg-rose-300 dark:bg-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-800 transition-colors cursor-pointer"
                                  title="Ouvir aviso de voz para esta nota fiscal"
                                >
                                  <Volume2 className="h-3 w-3 text-rose-700 dark:text-rose-300 animate-pulse shrink-0" />
                                  Ouvir Alerta
                                </button>
                              )}

                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">
                                NF {d?.nNF || 'S/N'} - {res.fileName}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">
                              <span className="font-semibold text-zinc-400">Chave:</span>
                              <span>{key || d?.chave || 'Chave não identificada'}</span>
                              {key && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(key)}
                                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ml-1 shrink-0"
                                  title="Copiar Chave de Acesso"
                                >
                                  {copiedKey === key ? (
                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 pt-0.5">
                              {d?.emitNome && (
                                <span>
                                  Emitente/Remetente: <b className="text-zinc-700 dark:text-zinc-200">{d.emitNome}</b>{' '}
                                  {(d?.emitCNPJ || res.nfeData?.emitente?.cnpj) && (
                                    <span className="font-mono text-[10px] text-zinc-500">
                                      ({d?.emitCNPJ || res.nfeData?.emitente?.cnpj})
                                    </span>
                                  )}
                                </span>
                              )}
                              {d?.destNome && (
                                <span>
                                  Destinatário: <b className="text-zinc-700 dark:text-zinc-200">{d.destNome}</b>{' '}
                                  {(d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj) && (
                                    <span className="font-mono text-[10px] text-zinc-500">
                                      ({d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj})
                                    </span>
                                  )}
                                </span>
                              )}
                              <span>
                                Qtd/Peso Nota: <b className="text-zinc-800 dark:text-zinc-100">{qtdNota}</b>
                              </span>
                              {isMatched && (
                                <>
                                  {matchInfo?.vagao && (
                                    <span>
                                      Vagão: <b className="text-indigo-700 dark:text-indigo-300">{matchInfo.vagao}</b>
                                    </span>
                                  )}
                                  {matchInfo?.pesoSelecionadoStr && (
                                    <span>
                                      Peso Sel. Excel: <b className="text-emerald-700 dark:text-emerald-300">{matchInfo.pesoSelecionadoStr}</b>
                                    </span>
                                  )}
                                  {matchInfo?.pesoNotaVagaoStr && (
                                    <span>
                                      Peso Nota Vagão: <b className="text-sky-700 dark:text-sky-300">{matchInfo.pesoNotaVagaoStr}</b>
                                    </span>
                                  )}
                                  {matchInfo?.taraStr && (
                                    <span>
                                      Tara: <b className="text-zinc-700 dark:text-zinc-300">{matchInfo.taraStr}</b>
                                    </span>
                                  )}
                                  {matchInfo?.pesoBrutoStr && (
                                    <span className="bg-amber-100/80 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-semibold">
                                      Peso Bruto: <b>{matchInfo.pesoBrutoStr}</b>
                                    </span>
                                  )}
                                </>
                              )}
                              {d?.vNF && <span>Valor Total: <b>R$ {d.vNF}</b></span>}
                            </div>

                            {/* Detalhes da Auditoria de IA para a Nota Individual */}
                            {(() => {
                              const itemAudit = auditResultsMap[key || res.fileName]
                              const hasDivergence = isMatched && vWeight.status === 'DIVERGENTE'
                              const isAuditingThis = auditingKey === (key || res.fileName) || (isAuditingAllWeights && hasDivergence)

                              if (itemAudit) {
                                return (
                                  <div className="mt-2 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1">
                                        <Bot className="h-3.5 w-3.5 text-purple-600" />
                                        Auditoria IA:
                                      </span>
                                      {itemAudit.status === 'ERRO_LEITURA_SISTEMA' && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200">
                                          Erro de Leitura do Sistema
                                        </span>
                                      )}
                                      {itemAudit.status === 'DIVERGENCIA_REAL' && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200">
                                          Divergência Real
                                        </span>
                                      )}
                                      {itemAudit.status === 'CONFERIDO_CORRETO' && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                                          Peso Correto
                                        </span>
                                      )}
                                      {itemAudit.pesoCorrigidoDoc !== undefined && itemAudit.pesoCorrigidoDoc !== null && (
                                        <span className="font-black text-purple-800 dark:text-purple-300">
                                          Valor Real: {itemAudit.pesoCorrigidoDoc.toLocaleString('pt-BR')} t
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-zinc-700 dark:text-zinc-300">
                                      {itemAudit.explicacao}
                                    </p>
                                    {itemAudit.status === 'ERRO_LEITURA_SISTEMA' && itemAudit.pesoCorrigidoDoc !== undefined && overrideWeightsMap[key || res.fileName] === undefined && (
                                      <button
                                        type="button"
                                        onClick={() => setOverrideWeightsMap(prev => ({ ...prev, [key || res.fileName]: itemAudit.pesoCorrigidoDoc! }))}
                                        className="text-[10px] font-bold px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded cursor-pointer inline-flex items-center gap-1"
                                      >
                                        <Check className="h-3 w-3" />
                                        Aplicar Valor Real ({itemAudit.pesoCorrigidoDoc} t)
                                      </button>
                                    )}
                                  </div>
                                )
                              }

                              if (hasDivergence) {
                                return (
                                  <div className="pt-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isAuditingThis}
                                      onClick={async () => {
                                        const itemId = key || res.fileName
                                        setAuditingKey(itemId)
                                        try {
                                          const prodInfo = `QUANT: ${d?.prodQCom || qtdNota} | UN: ${d?.prodUCom || 'KG'} | PesoLiq: ${d?.transpPesoL || ''} | PesoBruto: ${d?.transpPesoB || ''} | Vol: ${d?.transpQVol || ''}`
                                          const snippetFull = d?.rawSnippet ? `${prodInfo}\nTrecho DANFE:\n${d.rawSnippet}` : `${prodInfo}\nNF ${d?.nNF || ''} Emit: ${d?.emitNome || ''} Dest: ${d?.destNome || ''} Chave: ${key} DadosAdicionais: ${d?.infCpl || ''}`
                                          const singlePayload: WeightAuditItemInput[] = [{
                                            id: itemId,
                                            identificador: d?.nNF ? `NF ${d.nNF}` : res.fileName,
                                            numeroApenas: d?.nNF || '',
                                            serie: d?.serie || '',
                                            pesoMDF: overrideWeightsMap[itemId] !== undefined ? overrideWeightsMap[itemId] : qtdNota,
                                            pesoExcel: vWeight.pesoExcel || undefined,
                                            diferencaPeso: vWeight.diferenca || undefined,
                                            trechoTextoDocumento: snippetFull,
                                            linhaExcel: matchInfo?.row,
                                            dadosExcelRaw: matchInfo?.rawValue,
                                          }]
                                          const response = await auditarDivergenciasComIA(singlePayload)
                                          if (response.resultados.length > 0) {
                                            setAuditResultsMap(prev => ({ ...prev, [itemId]: response.resultados[0] }))
                                          }
                                        } catch (err) {
                                          console.error('Erro ao auditar nota individual:', err)
                                        } finally {
                                          setAuditingKey(null)
                                        }
                                      }}
                                      className="h-6 px-2 text-[10px] font-semibold border-purple-300 text-purple-700 dark:border-purple-800 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/60 cursor-pointer flex items-center gap-1"
                                    >
                                      {isAuditingThis ? (
                                        <>
                                          <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                                          Conferindo com IA...
                                        </>
                                      ) : (
                                        <>
                                          <Bot className="h-3 w-3 text-purple-600" />
                                          Conferir Nota com IA
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                )
                              }

                              return null
                            })()}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 justify-end">
                          {subMode === 'pdf-to-xml' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadSingleXML(res)}
                              className="gap-1.5 text-xs cursor-pointer"
                            >
                              <FileCode className="h-3.5 w-3.5 text-zinc-500" />
                              Baixar XML
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadSinglePDF(res)}
                              className="gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                            >
                              <Download className="h-3.5 w-3.5 text-emerald-600" />
                              Baixar DANFE PDF
                            </Button>
                          )}

                          {res.xmlContent && (
                            <Button
                              size="sm"
                              onClick={() => {
                                onAnalyzeXML(res.fileName.replace(/\.(pdf|xml)$/i, '.xml'), res.xmlContent!)
                              }}
                              className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              Analisar Nota
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Lista simples de resultados quando não houver planilha Excel carregada */}
      {results.length > 0 && !excelData && (
        <Card className="border border-zinc-100 dark:border-zinc-800">
          <CardHeader className="pb-3 border-b border-zinc-50 dark:border-zinc-900">
            <CardTitle className="text-lg">
              {subMode === 'pdf-to-xml' ? 'Resultados da Conversão PDF ➔ XML' : 'Resultados da Conversão XML ➔ PDF'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800">
            {results.map((result, idx) => {
              const key = getNormalizedKey(result) || result.parsedData?.chave || result.nfeData?.chaveAcesso || ''
              const emitCnpj = result.parsedData?.emitCNPJ || result.nfeData?.emitente?.cnpj || ''
              const destCnpj = result.parsedData?.destCNPJ || result.nfeData?.destinatario?.cpfCnpj || ''
              const vCNPJ = verifyChaveCNPJ(key, emitCnpj, destCnpj)

              return (
                <div key={idx} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {result.isProcessing ? (
                      <div className="rounded-full bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-950/40 animate-pulse">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : result.error ? (
                      <div className="rounded-full bg-red-100 p-2 text-red-600 dark:bg-red-950/40">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="rounded-full bg-green-100 p-2 text-green-600 dark:bg-green-950/40">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{result.fileName}</p>
                        {vCNPJ.chaveCnpjRaw && !result.error && !result.isProcessing && (
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              vCNPJ.isValid
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                            title={vCNPJ.details}
                          >
                            {vCNPJ.isValid ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-rose-600" />}
                            {vCNPJ.statusLabel}
                          </span>
                        )}

                        {vCNPJ.confrontoChaveXDest === 'DIVERGENTES' && !result.error && !result.isProcessing && (
                          <button
                            type="button"
                            onClick={() =>
                              speakText(
                                `Atenção! CNPJ da Chave é divergente do Destinatário no arquivo ${result.fileName}. ${vCNPJ.details}`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-200 text-rose-900 hover:bg-rose-300 dark:bg-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-800 transition-colors cursor-pointer"
                            title="Ouvir aviso de voz para esta nota fiscal"
                          >
                            <Volume2 className="h-3 w-3 text-rose-700 dark:text-rose-300 animate-pulse shrink-0" />
                            Ouvir Alerta
                          </button>
                        )}
                      </div>
                      {result.isProcessing ? (
                        <p className="text-xs text-indigo-500 mt-0.5">Processando notas...</p>
                      ) : result.error ? (
                        <p className="text-xs text-destructive mt-0.5">{result.error}</p>
                      ) : (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {subMode === 'pdf-to-xml' ? 'XML gerado com sucesso!' : 'DANFE PDF gerado com sucesso!'} Chave: {result.parsedData?.chave || 'Identificada'}
                        </p>
                      )}
                    </div>
                  </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  {subMode === 'pdf-to-xml' ? (
                    result.xmlContent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadSingleXML(result)}
                        className="gap-1.5"
                      >
                        <FileCode className="h-4 w-4 text-zinc-500" />
                        Baixar XML
                      </Button>
                    )
                  ) : (
                    result.nfeData && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadSinglePDF(result)}
                        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        <Download className="h-4 w-4 text-emerald-600" />
                        Baixar DANFE PDF
                      </Button>
                    )
                  )}

                  {result.xmlContent && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onAnalyzeXML(result.fileName.replace(/\.(pdf|xml)$/i, '.xml'), result.xmlContent!)
                      }}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Analisar Nota
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
