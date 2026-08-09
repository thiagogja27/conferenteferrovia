'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { parseNFE, verifyChaveCNPJ, type NFEData } from '@/lib/nfe-parser'
import { parsePdfClientSide } from '@/lib/client-pdf-parser'
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
} from 'lucide-react'

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

interface ExcelData {
  fileName: string
  totalRows: number
  keysMap: Map<string, ExcelMatchInfo>
  allKeysList: string[]
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
  const [isExcelLoading, setIsExcelLoading] = useState<boolean>(false)
  const [excelFilter, setExcelFilter] = useState<'all' | 'matched' | 'unmatched' | 'excel_only' | 'weight_divergent'>('all')
  const [excelSearchQuery, setExcelSearchQuery] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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
      fileType: 'xml' | 'pdf'
      contentOrBlob: File | Blob | string
    }

    const rawItems: RawItem[] = []

    for (const file of validFiles) {
      const lowerName = file.name.toLowerCase()
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
                rawItems.push({ fileName: cleanName, fileType: 'xml', contentOrBlob: xmlText })
              } else if (entryLower.endsWith('.pdf')) {
                const blob = await zipEntry.async('blob')
                rawItems.push({ fileName: cleanName, fileType: 'pdf', contentOrBlob: blob })
              }
            }
          }
        } catch (zipErr) {
          console.error('Erro ao processar arquivo ZIP:', zipErr)
        }
      } else if (lowerName.endsWith('.pdf')) {
        rawItems.push({ fileName: file.name, fileType: 'pdf', contentOrBlob: file })
      } else if (lowerName.endsWith('.xml')) {
        const xmlText = await file.text()
        rawItems.push({ fileName: file.name, fileType: 'xml', contentOrBlob: xmlText })
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
      const { generatePDF } = await import('@/lib/pdf-generator')
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
      const { generatePDF } = await import('@/lib/pdf-generator')
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

    // 2. Se não houver Peso Líquido, buscar a Quantidade de Produtos / Itens
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
  const parseExcelForKeys = async (file: File) => {
    setIsExcelLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })

      const keysMap = new Map<string, ExcelMatchInfo>()
      const allKeysList: string[] = []
      let totalRows = 0

      const globalWagonMap = new Map<string, { vagao: string; sheetName: string; sumPeso: number; tara: number; count: number; rows: number[] }>()

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
        totalRows += rows.length

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

            if (
              pesoColIndex === -1 &&
              (cellStr.includes('peso selecionado') ||
                cellStr.includes('peso_selecionado') ||
                cellStr.includes('peso sel'))
            ) {
              pesoColIndex = c
            }
          }
        }

        if (pesoColIndex === -1) {
          for (let r = 0; r < Math.min(rows.length, 30); r++) {
            const headerRow = rows[r]
            if (!headerRow) continue
            for (let c = 0; c < headerRow.length; c++) {
              const cellStr = String(headerRow[c] || '').trim().toLowerCase()
              if (
                cellStr.includes('peso liq') ||
                cellStr.includes('peso líquido') ||
                cellStr.includes('peso liquido') ||
                cellStr === 'peso' ||
                cellStr.includes('peso balança') ||
                cellStr.includes('peso medido') ||
                cellStr.includes('quant')
              ) {
                pesoColIndex = c
                break
              }
            }
            if (pesoColIndex !== -1) break
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
        }

        const tempRowRecords: TempRowRecord[] = []

        rows.forEach((row, rowIndex) => {
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

          if (rowKeys.length > 0) {
            tempRowRecords.push({
              rowIndex: rowIndex + 1,
              sheetName,
              keys: rowKeys,
              rawValue: primaryRawValue || rowKeys[0],
              pesoSelecionado,
              pesoSelecionadoStr,
              pesoNotaVagao,
              pesoNotaVagaoStr,
              tara,
              taraStr,
              vagao,
              brutoRow,
            })
          }
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

        // Processar cada registro e alimentar o keysMap
        tempRowRecords.forEach((rec) => {
          const effPeso = rec.pesoNotaVagao ?? rec.pesoSelecionado ?? 0
          let pesoBrutoCalc: number | null = null

          if (rec.vagao && wagonTotals.has(rec.vagao)) {
            const wInfo = wagonTotals.get(rec.vagao)!
            if (wInfo.sumPeso > 0 && wInfo.tara > 0) {
              // Rateia a tara do vagão proporcionalmente ao peso da nota no vagão
              const taraRateada = wInfo.tara * (effPeso / wInfo.sumPeso)
              pesoBrutoCalc = effPeso + taraRateada
            } else if (wInfo.bruto > 0 && wInfo.sumPeso > 0) {
              pesoBrutoCalc = wInfo.bruto * (effPeso / wInfo.sumPeso)
            } else if (effPeso > 0) {
              pesoBrutoCalc = effPeso + (rec.tara || 0)
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

          rec.keys.forEach((k) => {
            if (!keysMap.has(k)) {
              let pVal = rec.pesoSelecionado
              let pStr = rec.pesoSelecionadoStr

              if (pVal === null && effPeso > 0) {
                pVal = effPeso
                pStr = String(effPeso)
              }

              keysMap.set(k, {
                row: rec.rowIndex,
                rawValue: rec.rawValue,
                sheetName: rec.sheetName,
                pesoSelecionado: pVal,
                pesoSelecionadoStr: pStr,
                pesoNotaVagao: rec.pesoNotaVagao,
                pesoNotaVagaoStr: rec.pesoNotaVagaoStr,
                tara: rec.tara,
                taraStr: rec.taraStr,
                vagao: rec.vagao,
                pesoBruto: pesoBrutoCalc,
                pesoBrutoStr,
              })
              allKeysList.push(k)
            }
          })
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

      setExcelData({
        fileName: file.name,
        totalRows,
        keysMap,
        allKeysList,
        sheets: workbook.SheetNames,
        wagonSummaries: wagonSummariesList,
      })
    } catch (err) {
      console.error('Erro ao ler planilha Excel:', err)
      alert('Falha ao ler o arquivo Excel. Verifique se o arquivo está no formato correto (.xlsx, .xls ou .csv).')
    } finally {
      setIsExcelLoading(false)
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

    // 2. ABA CONSOLIDAÇÃO POR VAGÃO (CÁLCULO TOTAL: SOMA DE PESO_NOTA_VAGAO + TARA)
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

    // 2. ABA TOTAL DE ARQUIVOS (ORDENADOS CONFORME A ORDEM DAS CHAVES DA PLANILHA EXCEL)
    const orderedAllResults = [...validConvertedResults].sort((a, b) => {
      const keyA = getNormalizedKey(a)
      const keyB = getNormalizedKey(b)
      const matchA = getExcelMatchInfo(keyA)
      const matchB = getExcelMatchInfo(keyB)

      if (matchA && matchB) {
        return matchA.row - matchB.row
      }
      if (matchA && !matchB) return -1
      if (!matchA && matchB) return 1
      return keyA.localeCompare(keyB)
    })

    const rowsTotalOrdered = orderedAllResults.map((res) => {
      const d = res.parsedData
      const key = getNormalizedKey(res)
      const matchInfo = getExcelMatchInfo(key)
      const isMatched = !!matchInfo
      const destCNPJ = d?.destCNPJ || res.nfeData?.destinatario?.cpfCnpj || ''
      const vCNPJ = verifyChaveCNPJ(key || d?.chave || '', d?.emitCNPJ || res.nfeData?.emitente?.cnpj || '', destCNPJ)
      const qtdNota = getResultQuantidade(res)
      const vWeight = confrontWeights(matchInfo, qtdNota)

      return {
        'Posição / Linha Excel': matchInfo ? `Linha ${matchInfo.row} (${matchInfo.sheetName})` : 'Fora da Planilha Excel',
        'Status Conferência Excel': isMatched ? 'CONSTA NA PLANILHA' : 'NÃO CONSTA NA PLANILHA',
        'Vagão (Excel)': matchInfo?.vagao || 'N/A',
        'Chave de Acesso': key || d?.chave || '',
        'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
        'Destinatário CNPJ': destCNPJ,
        'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
        'Validação CNPJ': vCNPJ.statusLabel,
        'Nº Nota (nNF)': d?.nNF || '',
        'Série': d?.serie || '',
        'Peso Selecionado (Excel)': vWeight.pesoExcelStr,
        'Quantidade Extraída (Nota)': qtdNota,
        'Confronto Peso (Excel vs Nota)': vWeight.statusLabel,
        'Diferença de Peso (Excel - Nota)': vWeight.pesoExcel !== null ? vWeight.diferenca : 'N/A',
        'Valor Total (R$)': d?.vNF || 0,
        'Emitente': d?.emitNome || '',
        'CNPJ Emitente': d?.emitCNPJ || '',
        'Destinatário': d?.destNome || '',
        'Nome do Arquivo': res.fileName,
        'Tipo Documento': subMode === 'pdf-to-xml' ? 'PDF' : 'XML',
      }
    })
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
        'Quantidade Extraída (Nota)': qtdNota,
        'Confronto Peso (Excel vs Nota)': vWeight.statusLabel,
        'Diferença de Peso (Excel - Nota)': vWeight.pesoExcel !== null ? vWeight.diferenca : 'N/A',
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

    // 5. ABA CHAVES NA PLANILHA EXCEL SEM ARQUIVO CORRESPONDENTE
    if (excelKeysWithoutFiles.length > 0 && excelData) {
      const rowsExcelOnly = excelKeysWithoutFiles.map((key) => {
        const matchInfo = getExcelMatchInfo(key)
        return {
          'Linha no Excel': matchInfo ? `Linha ${matchInfo.row}` : 'N/A',
          'Aba no Excel': matchInfo?.sheetName || '',
          'Chave de Acesso (Excel)': key,
          'Vagão (Excel)': matchInfo?.vagao || 'N/A',
          'Peso Selecionado (Excel)': matchInfo?.pesoSelecionadoStr || 'N/A',
          'Conteúdo Original Célula': matchInfo?.rawValue || '',
          'Status': 'FALTANDO ARQUIVO DE NOTA (PDF/XML)',
          'Observação': 'Chave consta na planilha Excel, porém nenhum arquivo correspondente foi importado',
        }
      })
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
            <Dashboard files={results.map((r) => ({ fileName: r.fileName, nfeData: r.nfeData || null, parsedData: r.parsedData || null }))} />
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
              <div className="flex items-center gap-2">
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
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 underline font-medium cursor-pointer self-start sm:self-auto"
                >
                  Trocar planilha
                </button>
                <input
                  type="file"
                  ref={excelInputRef}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelInputChange}
                />
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
                          Excel x Nota idênticos
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
                          Peso Excel ≠ Qtd Nota
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
