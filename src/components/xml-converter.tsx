'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { parseNFE, verifyChaveCNPJ, type NFEData } from '@/lib/nfe-parser'
import { parsePdfClientSide } from '@/lib/client-pdf-parser'
import { generatePDF } from '@/lib/pdf-generator'
import { Dashboard } from '@/components/dashboard'
import { SearchPanel } from '@/components/search-panel'
import { MapPanel } from '@/components/map-panel'
import { ExcelReconciliationTab } from '@/components/excel-reconciliation-tab'
import { MDFExcelComparator } from '@/components/mdf-excel-comparator'
import { DocumentationPanel } from '@/components/documentation-panel'
import {
  FileText,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileArchive,
  Loader2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Search,
  List,
  MapPin,
  Truck,
  Package,
  FileSpreadsheet,
  Map,
  Sparkles,
  FileCode,
  Folder,
  AlertTriangle,
  Volume2,
  VolumeX,
  Volume1,
  BookOpen,
  Filter,
  Layers,
  TrainTrack,
  Scale,
  Copy,
  Check,
  CheckCheck,
  Eye,
} from 'lucide-react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

interface ProcessedFile {
  fileName: string
  originalPath: string
  xmlContent: string
  nfeData: NFEData | null
  error: string | null
}

async function getAllFilesFromDataTransfer(
  dataTransfer: DataTransfer,
  processFileType: 'all' | 'xml' | 'pdf' = 'all'
): Promise<File[]> {
  const files: File[] = []

  const isAcceptedType = (cleanName: string) => {
    if (cleanName.endsWith('.zip')) return true
    if (processFileType === 'xml') return cleanName.endsWith('.xml')
    if (processFileType === 'pdf') return cleanName.endsWith('.pdf')
    return cleanName.endsWith('.pdf') || cleanName.endsWith('.xml')
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
        if (!isAcceptedType(cleanName)) {
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
            if (isAcceptedType(lower)) {
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
      return isAcceptedType(lower)
    })
  }

  return files
}

export function XMLConverter() {
  const [files, setFiles] = useState<ProcessedFile[]>([])
  const [otherZipFiles, setOtherZipFiles] = useState<{ path: string; content: Blob }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<string>('list')
  const [converterMode, setConverterMode] = useState<'xml-to-pdf' | 'pdf-to-xml' | 'mdf-x-excel' | 'documentation'>('xml-to-pdf')
  const [processFileType, setProcessFileType] = useState<'all' | 'xml' | 'pdf'>('all')
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [listFilterTerm, setListFilterTerm] = useState('')
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(true)
  const [selectedXmlModal, setSelectedXmlModal] = useState<{ fileName: string; content: string } | null>(null)
  const [copiedXml, setCopiedXml] = useState(false)

  const handleCopyXml = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedXml(true)
    setTimeout(() => setCopiedXml(false), 2000)
  }

  const handleDownloadXML = (file: ProcessedFile) => {
    if (!file.xmlContent) {
      alert('Conteúdo XML não disponível para este arquivo.')
      return
    }
    const blob = new Blob([file.xmlContent], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const baseName = file.fileName.replace(/\.(pdf|xml)$/i, '')
    a.download = `${baseName}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadAllXMLs = async () => {
    const successfulFiles = files.filter((f) => f.xmlContent && f.xmlContent.trim().length > 0)
    if (successfulFiles.length === 0) {
      alert('Nenhum conteúdo XML válido disponível para download.')
      return
    }

    try {
      setIsDownloading(true)
      const zip = new JSZip()
      successfulFiles.forEach((file) => {
        const baseName = file.fileName.replace(/\.(pdf|xml)$/i, '')
        zip.file(`${baseName}.xml`, file.xmlContent)
      })

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `notas_fiscais_xmls_${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar ZIP de XMLs:', err)
      alert('Erro ao gerar arquivo ZIP com os XMLs.')
    } finally {
      setIsDownloading(false)
    }
  }

  // Estados e funções para Alerta por Voz (Web Speech API)
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
      speakText('Alerta por voz ativado para o Painel de Conferência de Notas.')
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }

  const checkAndSpeakDivergencesXML = useCallback(
    (itemsList: ProcessedFile[]) => {
      if (!voiceAlertEnabled) return

      const divergentItems = itemsList.filter((f) => {
        if (!f.nfeData) return false
        const vCNPJ = f.nfeData.verificacaoCNPJ || verifyChaveCNPJ(
          f.nfeData.chaveAcesso,
          f.nfeData.emitente.cnpj,
          f.nfeData.destinatario.cpfCnpj
        )
        return vCNPJ.confrontoChaveXDest === 'DIVERGENTES'
      })

      if (divergentItems.length === 1) {
        const item = divergentItems[0]
        const docNum = item.nfeData?.numero
          ? `nota fiscal número ${item.nfeData.numero}`
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

  const processXMLContent = async (
    fileName: string,
    originalPath: string,
    content: string
  ): Promise<ProcessedFile> => {
    try {
      const data = parseNFE(content)
      return { fileName, originalPath, xmlContent: content, nfeData: data, error: null }
    } catch (err) {
      console.error(`Erro ao processar ${fileName}:`, err)
      return { fileName, originalPath, xmlContent: content, nfeData: null, error: 'Erro ao processar arquivo XML' }
    }
  }

  const fileToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1] || result
        resolve(base64)
      }
      reader.onerror = (error) => reject(error)
      reader.readAsDataURL(file)
    })
  }

  const convertPDFToXMLAndParse = async (
    fileName: string,
    originalPath: string,
    fileOrBlob: File | Blob
  ): Promise<ProcessedFile[]> => {
    let apiSuccess = false
    let data: any = null

    try {
      const base64Data = await fileToBase64(fileOrBlob)
      const response = await fetch('/api/pdf-to-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64Data, fileName }),
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
          const nfeData = parseNFE(it.xml)
          return {
            fileName: it.fileName || fileName,
            originalPath,
            xmlContent: it.xml,
            nfeData,
            error: nfeData ? null : 'Não foi possível interpretar os dados do PDF.',
          }
        })
      }

      if (data.xml) {
        const nfeData = parseNFE(data.xml)
        return [{
          fileName,
          originalPath,
          xmlContent: data.xml,
          nfeData,
          error: nfeData ? null : 'Não foi possível interpretar os dados do PDF.',
        }]
      }
    }

    // Fallback 100% no navegador (Client-Side) com pdfjs-dist
    try {
      const fileToParse = fileOrBlob instanceof File ? fileOrBlob : new File([fileOrBlob], fileName, { type: 'application/pdf' })
      const clientResult = await parsePdfClientSide(fileToParse, fileName)

      if (clientResult.items && clientResult.items.length > 0) {
        return clientResult.items.map((it: any) => ({
          fileName: it.fileName || fileName,
          originalPath,
          xmlContent: it.xml,
          nfeData: it.nfeData || (it.xml ? parseNFE(it.xml) : null),
          error: it.xml ? null : 'Não foi possível interpretar os dados do PDF.',
        }))
      }

      return [{
        fileName,
        originalPath,
        xmlContent: clientResult.xml || '',
        nfeData: clientResult.nfeData || (clientResult.xml ? parseNFE(clientResult.xml) : null),
        error: clientResult.xml ? null : 'Não foi possível interpretar os dados do PDF.',
      }]
    } catch (clientErr: any) {
      return [{
        fileName,
        originalPath,
        xmlContent: '',
        nfeData: null,
        error: clientErr.message || 'Erro ao processar PDF.',
      }]
    }
  }

  const handleAnalyzeGeneratedXML = async (fileName: string, xmlContent: string) => {
    setIsProcessing(true)
    const result = await processXMLContent(fileName, fileName, xmlContent)
    setFiles([result])
    setIsProcessing(false)
    setConverterMode('xml-to-pdf')
    setActiveTab('list')
    setExpandedIndex(0)
    checkAndSpeakDivergencesXML([result])

    if (result.nfeData) {
      const hasTeg = result.nfeData.terminalEntrega?.toUpperCase()?.includes('TEG')
      const hasTeag = result.nfeData.terminalEntrega?.toUpperCase()?.includes('TEAG')

      if (hasTeg && hasTeag) {
        alert('Foram encontradas notas com os terminais TEG e TEAG.')
      } else if (hasTeg) {
        alert('Foram encontradas notas com o terminal TEG.')
      } else if (hasTeag) {
        alert('Foram encontradas notas com o terminal TEAG.')
      } else {
        alert('Nenhuma nota com terminal de entrega TEG ou TEAG foi encontrada.')
      }
    }
  }

  interface ZipFileData {
    files: ProcessedFile[]
    otherFiles: { path: string; content: Blob }[]
  }

  const processZipFile = async (zipFile: File, typeFilter: 'all' | 'xml' | 'pdf' = processFileType): Promise<ZipFileData> => {
    const zip = new JSZip()
    const contents = await zip.loadAsync(zipFile)
    const results: ProcessedFile[] = []
    const otherFiles: { path: string; content: Blob }[] = []

    const allFiles = Object.keys(contents.files).filter(
      (name) => !contents.files[name].dir
    )

    const pdfQueue: { fileName: string; filePath: string; pdfBlob: Blob }[] = []

    for (const filePath of allFiles) {
      const fileName = filePath.split('/').pop() || filePath
      const lowerPath = filePath.toLowerCase()
      
      if (lowerPath.endsWith('.xml')) {
        if (typeFilter === 'pdf') continue // Ignora XML se o filtro for apenas PDF
        const fileContent = await contents.files[filePath].async('string')
        const result = await processXMLContent(fileName, filePath, fileContent)
        results.push(result)
      } else if (lowerPath.endsWith('.pdf')) {
        if (typeFilter === 'xml') continue // Ignora PDF se o filtro for apenas XML
        const pdfBlob = await contents.files[filePath].async('blob')
        pdfQueue.push({ fileName, filePath, pdfBlob })
      } else {
        const content = await contents.files[filePath].async('blob')
        otherFiles.push({ path: filePath, content })
      }
    }

    if (pdfQueue.length > 0) {
      const CONCURRENCY_LIMIT = 6
      const pdfWorker = async () => {
        while (pdfQueue.length > 0) {
          const item = pdfQueue.shift()
          if (!item) break
          const pdfResults = await convertPDFToXMLAndParse(item.fileName, item.filePath, item.pdfBlob)
          results.push(...pdfResults)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, pdfQueue.length) }, pdfWorker))
    }

    return { files: results, otherFiles }
  }

  const processFiles = useCallback(async (selectedFiles: FileList | File[], overrideFileType?: 'all' | 'xml' | 'pdf') => {
    const typeFilter = overrideFileType || processFileType
    setIsProcessing(true)
    setFiles([])
    setOtherZipFiles([])
    setExpandedIndex(null)

    interface WorkItem {
      fileName: string
      filePath: string
      type: 'xml' | 'pdf' | 'unsupported'
      contentOrBlob: string | File | Blob
    }

    const workItems: WorkItem[] = []
    const allOtherFiles: { path: string; content: Blob }[] = []
    const directResults: ProcessedFile[] = []

    for (const file of Array.from(selectedFiles)) {
      const fileName = file.name.toLowerCase()

      if (fileName.endsWith('.zip')) {
        try {
          const zipData = await processZipFile(file, typeFilter)
          directResults.push(...zipData.files)
          allOtherFiles.push(...zipData.otherFiles)
        } catch (err) {
          console.error(`[v0] Erro ao processar o arquivo ZIP '${file.name}':`, err)
        }
      } else if (fileName.endsWith('.xml')) {
        if (typeFilter === 'pdf') continue // Filtro apenas PDF ativo
        const content = await file.text()
        const origPath = (file as any).originalPath || (file as any).filePath || file.webkitRelativePath || file.name
        workItems.push({
          fileName: file.name,
          filePath: origPath,
          type: 'xml',
          contentOrBlob: content,
        })
      } else if (fileName.endsWith('.pdf')) {
        if (typeFilter === 'xml') continue // Filtro apenas XML ativo
        const origPath = (file as any).originalPath || (file as any).filePath || file.webkitRelativePath || file.name
        workItems.push({
          fileName: file.name,
          filePath: origPath,
          type: 'pdf',
          contentOrBlob: file,
        })
      }
    }

    if (workItems.length === 0 && directResults.length === 0) {
      setIsProcessing(false)
      if (typeFilter === 'xml') {
        alert("Nenhum arquivo XML (.xml) encontrado na seleção. O filtro 'Processar apenas XML' está ativo.")
      } else if (typeFilter === 'pdf') {
        alert("Nenhum arquivo PDF (.pdf) encontrado na seleção. O filtro 'Processar apenas PDFs' está ativo.")
      } else {
        alert("Nenhum arquivo de nota fiscal (XML, PDF ou ZIP) válido foi encontrado na seleção.")
      }
      return
    }

    const results: ProcessedFile[] = [...directResults]
    const CONCURRENCY_LIMIT = 6
    const pdfQueue = workItems.filter(w => w.type === 'pdf')

    // Process XMLs and unsupported immediately
    for (const item of workItems) {
      if (item.type === 'xml') {
        const res = await processXMLContent(item.fileName, item.filePath, item.contentOrBlob as string)
        results.push(res)
      } else if (item.type === 'unsupported') {
        results.push({
          fileName: item.fileName,
          originalPath: item.filePath,
          xmlContent: '',
          nfeData: null,
          error: 'Formato não suportado. Use XML, PDF ou ZIP.',
        })
      }
    }
    setFiles([...results])

    // Process PDFs concurrently in batches of 6 with live updates
    if (pdfQueue.length > 0) {
      const worker = async () => {
        while (pdfQueue.length > 0) {
          const item = pdfQueue.shift()
          if (!item) break
          const pdfResults = await convertPDFToXMLAndParse(item.fileName, item.filePath, item.contentOrBlob as File | Blob)
          results.push(...pdfResults)
          setFiles([...results])
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, pdfQueue.length) }, worker))
    }

    setOtherZipFiles(allOtherFiles)
    setIsProcessing(false)
    checkAndSpeakDivergencesXML(results)

    if (results.some(r => r.nfeData)) {
      const hasTeg = results.some(r => r.nfeData?.terminalEntrega?.toUpperCase().includes('TEG'))
      const hasTeag = results.some(r => r.nfeData?.terminalEntrega?.toUpperCase().includes('TEAG'))

      if (hasTeg && hasTeag) {
        alert('Foram encontradas notas com os terminais TEG e TEAG.')
      } else if (hasTeg) {
        alert('Foram encontradas notas com o terminal TEG.')
      } else if (hasTeag) {
        alert('Foram encontradas notas com o terminal TEAG.')
      } else {
        alert('Nenhuma nota com terminal de entrega TEG ou TEAG foi encontrada.')
      }
    }

    if (results.length === 1 && results[0].nfeData) {
      setExpandedIndex(0)
    }
  }, [checkAndSpeakDivergencesXML, processFileType])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      processFiles(selectedFiles, processFileType)
    }
  }

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer) {
        const extractedFiles = await getAllFilesFromDataTransfer(e.dataTransfer, processFileType)
        if (extractedFiles.length > 0) {
          processFiles(extractedFiles, processFileType)
        }
      }
    },
    [processFiles, processFileType]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDownloadPDF = async (processedFile: ProcessedFile) => {
    if (!processedFile.nfeData) return;

    const doc = generatePDF(processedFile.nfeData);
    const baseName = processedFile.fileName.replace(/\.xml$/i, '');
    const fileName = `NF_${processedFile.nfeData.numero || baseName}_${Date.now()}.pdf`;
    doc.save(fileName);
  }

  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownloadAllPDFs = async () => {
    const successfulFiles = files.filter((f) => f.nfeData !== null);
    if (successfulFiles.length === 0) return;

    if (successfulFiles.length === 1 && otherZipFiles.length === 0) {
      handleDownloadPDF(successfulFiles[0]);
      return;
    }

    setIsDownloading(true);

    try {
      const zip = new JSZip();

      for (const file of files) {
        const normalizedPath = file.originalPath.replace(/\\/g, "/");
        const lastSlashIndex = normalizedPath.lastIndexOf('/');
        const folderPath = lastSlashIndex > -1 ? normalizedPath.substring(0, lastSlashIndex + 1) : '';

        if (file.xmlContent) {
          zip.file(normalizedPath, file.xmlContent);
        }

        if (file.nfeData) {
          try {
            const doc = generatePDF(file.nfeData);
            const pdfBlob = doc.output("blob");
            const baseName = file.fileName.replace(/\.xml$/i, '');
            const pdfFileName = `${file.nfeData.numero || baseName}.pdf`;
            const fullPdfPath = `${folderPath}${pdfFileName}`;
            zip.file(fullPdfPath, pdfBlob);
          } catch (pdfErr) {
            console.error(`[v0] Erro ao gerar PDF para: ${file.fileName}`, pdfErr);
          }
        }
      }

      for (const otherFile of otherZipFiles) {
        const normalizedPath = otherFile.path.replace(/\\/g, "/");
        zip.file(normalizedPath, otherFile.content);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notas_fiscais_convertidas_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[v0] Erro ao gerar ZIP:', err);
      alert('Erro ao gerar o arquivo ZIP. Verifique o console para mais detalhes.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadExcel = () => {
    const successfulFiles = files.filter((f) => f.nfeData !== null);
    if (successfulFiles.length === 0) return;

    const dataToExport = [];
    const headers = [
      "Arquivo", "Chave de Acesso", "CNPJ na Chave", "Validação CNPJ (Chave x Rem/Dest)", "Numero NFe", "Data Emissão",
      "Emitente Nome", "Emitente CNPJ", "Destinatário Nome", "Destinatário CNPJ",
      "Quantidade", "Valor Total", "Terminal de Entrega", "Transbordo", "Retirada", "Tipo Produto"
    ];

    for (const file of successfulFiles) {
        if (file.nfeData) {
            const vCNPJ = file.nfeData.verificacaoCNPJ || verifyChaveCNPJ(
              file.nfeData.chaveAcesso,
              file.nfeData.emitente.cnpj,
              file.nfeData.destinatario.cpfCnpj
            )
            const pesoLiquido = file.nfeData.transportador?.pesoLiquido ? Number(file.nfeData.transportador.pesoLiquido) : 0

            const sumItensQtd = file.nfeData.itens?.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0)
            const quantidadeVal = (pesoLiquido && pesoLiquido > 0)
              ? pesoLiquido
              : (sumItensQtd && sumItensQtd > 0 ? sumItensQtd : (file.nfeData.transportador?.quantidade || 0))

            dataToExport.push([
                file.fileName,
                file.nfeData.chaveAcesso,
                vCNPJ.chaveCnpj || "N/I",
                vCNPJ.statusLabel,
                file.nfeData.numero,
                file.nfeData.dataEmissao,
                file.nfeData.emitente.nome,
                file.nfeData.emitente.cnpj,
                file.nfeData.destinatario.nome,
                file.nfeData.destinatario.cpfCnpj,
                quantidadeVal,
                file.nfeData.impostos.valorTotal,
                file.nfeData.terminalEntrega,
                file.nfeData.transbordo,
                file.nfeData.retirada,
                file.nfeData.tipoProduto
            ]);
        }
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataToExport]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Notas Fiscais");

    const itemsDataToExport: any[][] = [];
    const itemHeaders = ["Chave de Acesso", "Numero NFe", "Código Produto", "Descrição", "NCM", "CFOP", "Quantidade", "Unidade", "Valor Unitário", "Valor Total"];

    for (const file of successfulFiles) {
        if (file.nfeData && file.nfeData.itens) {
            file.nfeData.itens.forEach(item => {
                itemsDataToExport.push([
                    file.nfeData!.chaveAcesso,
                    file.nfeData!.numero,
                    item.codigo,
                    item.descricao,
                    item.ncm,
                    item.cfop,
                    item.quantidade,
                    item.unidade,
                    item.valorUnitario,
                    item.valorTotal
                ]);
            });
        }
    }

    if(itemsDataToExport.length > 0) {
        const itemsWorksheet = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemsDataToExport]);
        XLSX.utils.book_append_sheet(workbook, itemsWorksheet, "Itens das Notas");
    }

    XLSX.writeFile(workbook, `relatorio_nfe_${Date.now()}.xlsx`);
  };

  const handleClear = () => {
    setFiles([])
    setOtherZipFiles([])
    setExpandedIndex(null)
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  const successCount = files.filter((f) => f.nfeData !== null).length
  const errorCount = files.filter((f) => f.error !== null).length

  const totalValor = files.reduce((acc, f) => acc + (f.nfeData?.impostos?.valorTotal || 0), 0)
  const totalPesoLiquido = files.reduce((acc, f) => {
    const raw = f.nfeData?.transportador?.pesoLiquido || '0'
    const num = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'))
    return acc + (isNaN(num) ? 0 : num)
  }, 0)
  const totalPesoBruto = files.reduce((acc, f) => {
    const raw = f.nfeData?.transportador?.pesoBruto || '0'
    const num = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'))
    return acc + (isNaN(num) ? 0 : num)
  }, 0)
  const divergentCount = files.filter((f) => {
    if (!f.nfeData) return false
    const v = f.nfeData.verificacaoCNPJ || verifyChaveCNPJ(
      f.nfeData.chaveAcesso,
      f.nfeData.emitente.cnpj,
      f.nfeData.destinatario.cpfCnpj
    )
    return v.confrontoChaveXDest === 'DIVERGENTES'
  }).length

  const filteredFiles = files.filter((f) => {
    if (!listFilterTerm.trim()) return true
    const term = listFilterTerm.toLowerCase()
    const n = f.nfeData
    const fileName = f.fileName.toLowerCase()
    if (fileName.includes(term)) return true
    if (!n) return false
    return (
      (n.numero && n.numero.toLowerCase().includes(term)) ||
      (n.chaveAcesso && n.chaveAcesso.toLowerCase().includes(term)) ||
      (n.emitente?.nome && n.emitente.nome.toLowerCase().includes(term)) ||
      (n.emitente?.cnpj && n.emitente.cnpj.includes(term)) ||
      (n.destinatario?.nome && n.destinatario.nome.toLowerCase().includes(term)) ||
      (n.destinatario?.cpfCnpj && n.destinatario.cpfCnpj.includes(term)) ||
      (n.terminalEntrega && n.terminalEntrega.toLowerCase().includes(term)) ||
      (n.transbordo && n.transbordo.toLowerCase().includes(term)) ||
      (n.retirada && n.retirada.toLowerCase().includes(term)) ||
      n.itens.some((it) => it.descricao && it.descricao.toLowerCase().includes(term))
    )
  })

  return (
    <div className='min-h-screen bg-background p-4 md:p-8'>
      <div className={`mx-auto transition-all ${converterMode === 'mdf-x-excel' ? 'max-w-6xl xl:max-w-7xl' : 'max-w-5xl lg:max-w-6xl'}`}>
        {/* Header Principal */}
        <div className='mb-6 text-center'>
          <div className='inline-flex items-center justify-center rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 p-3 mb-3 text-indigo-600 dark:text-indigo-400 shadow-xs'>
            <FileText className='h-8 w-8' />
          </div>
          <h1 className='text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground'>
            Sistema de Conferência Fiscal
          </h1>
        </div>

        {/* Seletor de Módulos (Menu Principal Intuitivo e Unificado) */}
        <div className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-100/80 dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
            <button
              onClick={() => setConverterMode('xml-to-pdf')}
              className={`flex flex-col items-start p-3.5 rounded-xl transition-all text-left cursor-pointer border ${
                converterMode === 'xml-to-pdf'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border-indigo-300 dark:border-indigo-600 shadow-xs'
                  : 'bg-transparent border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 w-full">
                <div className={`p-1.5 rounded-lg ${converterMode === 'xml-to-pdf' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
                  <FileCode className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold truncate">Painel de Conferência (NF-e XML / PDF)</span>
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                Conferência, DANFE, Chaves x Dest, Pesos e Conversão
              </span>
            </button>

            <button
              onClick={() => setConverterMode('mdf-x-excel')}
              className={`flex flex-col items-start p-3.5 rounded-xl transition-all text-left cursor-pointer border ${
                converterMode === 'mdf-x-excel'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border-amber-300 dark:border-amber-600 shadow-xs'
                  : 'bg-transparent border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 w-full">
                <div className={`p-1.5 rounded-lg ${converterMode === 'mdf-x-excel' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
                  <TrainTrack className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold truncate">MDF x EXCEL (Vagões)</span>
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                Conciliação Manifesto x Excel de Vagões
              </span>
            </button>

            <button
              onClick={() => setConverterMode('documentation')}
              className={`flex flex-col items-start p-3.5 rounded-xl transition-all text-left cursor-pointer border ${
                converterMode === 'documentation'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border-emerald-300 dark:border-emerald-600 shadow-xs'
                  : 'bg-transparent border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 w-full">
                <div className={`p-1.5 rounded-lg ${converterMode === 'documentation' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
                  <BookOpen className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold truncate">Guia de Uso & Regras</span>
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                Manual, Transbordos (Pradópolis) e Dicas
              </span>
            </button>
          </div>
        </div>

        {/* Módulos do Sistema Preservados em Memória */}
        <div className={converterMode === 'xml-to-pdf' ? 'block' : 'hidden'}>
          {/* Upload Area */}
          <Card className='mb-6 shadow-xs border-zinc-200 dark:border-zinc-800'>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
                <div>
                  <CardTitle className='text-lg font-bold flex items-center gap-2'>
                    <Upload className="h-5 w-5 text-indigo-500" />
                    Carregar Notas Fiscais
                  </CardTitle>
                  <CardDescription>
                    Arraste arquivos XML, PDFs de DANFE, arquivos ZIP ou pastas inteiras contendo notas fiscais
                  </CardDescription>
                </div>

                {/* Controles de Alerta de Voz no Painel de Conferência */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
                    onClick={() => speakText('Teste da função de áudio e voz no Painel de Conferência. O sistema emitirá este aviso sonoro sempre que o CNPJ da Chave for divergente do Destinatário.')}
                    className="text-xs h-7 px-2.5 gap-1 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    title="Testar sintetizador de voz"
                  >
                    <Volume1 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    Testar Voz
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConverterMode('documentation')}
                    className="text-xs h-7 px-2.5 gap-1.5 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer"
                    title="Abrir Manual e Guia de Instruções do Sistema"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    Guia de Uso
                  </Button>
                </div>
              </CardHeader>

          <CardContent className="space-y-4">
            {/* Opções de Seleção de Tipo de Arquivo a Processar */}
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-indigo-500 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide block">
                      Filtro de Leitura de Arquivos
                    </span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Selecione qual formato o sistema deve ler para otimizar o tempo de conferência
                    </p>
                  </div>
                </div>

                <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-1 rounded-lg text-xs font-medium self-start md:self-auto flex-wrap sm:flex-nowrap gap-1">
                  <button
                    type="button"
                    onClick={() => setProcessFileType('all')}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      processFileType === 'all'
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-50 font-bold'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5 text-indigo-500" />
                    Processar Todos (XML e PDF)
                  </button>

                  <button
                    type="button"
                    onClick={() => setProcessFileType('xml')}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      processFileType === 'xml'
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5 text-emerald-300" />
                    Processar apenas XML
                  </button>

                  <button
                    type="button"
                    onClick={() => setProcessFileType('pdf')}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      processFileType === 'pdf'
                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-indigo-200" />
                    Processar apenas PDFs
                  </button>
                </div>
              </div>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all p-6 text-center ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 hover:border-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
              }`}
            >
              <input
                type='file'
                accept={
                  processFileType === 'xml'
                    ? '.xml,.zip'
                    : processFileType === 'pdf'
                    ? '.pdf,.zip'
                    : '.xml,.pdf,.zip'
                }
                multiple
                onChange={handleFileChange}
                className='absolute inset-0 cursor-pointer opacity-0'
              />
              {isProcessing ? (
                <>
                  <Loader2 className='mb-3 h-10 w-10 animate-spin text-indigo-600 dark:text-indigo-400' />
                  <p className='text-sm font-bold text-foreground'>Processando e conferindo arquivos...</p>
                  <p className='text-xs text-muted-foreground mt-1'>Auditando Chaves de Acesso, Terminais e Transbordos</p>
                </>
              ) : (
                <>
                  <div className='mb-3 flex items-center gap-2'>
                    <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400">
                      <FileCode className="h-6 w-6" />
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400">
                      <Folder className="h-6 w-6" />
                    </div>
                  </div>
                  <p className='text-sm font-bold text-foreground'>
                    {isDragOver
                      ? 'Solte os arquivos ou pastas aqui!'
                      : 'Arraste seus arquivos XML, PDFs, pacotes ZIP ou pastas de vagões aqui'}
                  </p>
                  <p className='text-xs text-muted-foreground mt-1 max-w-md'>
                    Ou utilize os botões abaixo para selecionar arquivos ou pastas com subpastas do seu computador
                  </p>

                  <div className="mt-3.5 flex items-center gap-2.5 z-20" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="file"
                      id="xml-folder-upload"
                      ref={folderInputRef}
                      className="hidden"
                      onChange={handleFileChange}
                      {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => folderInputRef.current?.click()}
                      className="cursor-pointer bg-white dark:bg-zinc-800 border-amber-300 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold shadow-xs text-xs"
                    >
                      <Folder className="mr-1.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                      Selecionar Pasta(s) de Vagões
                    </Button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap justify-center pointer-events-none">
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                      .XML (NF-e)
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                      .PDF (DANFE)
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                      .ZIP
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800">
                      Pastas c/ Nome de Vagão
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Barra de Ações Rápidas quando há arquivos */}
            {files.length > 0 && (
              <div className='mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-100/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'>
                <div className='flex items-center gap-3 text-xs font-semibold flex-wrap'>
                  {successCount > 0 && (
                    <span className='flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800'>
                      <CheckCircle2 className='h-3.5 w-3.5' />
                      {successCount} nota{successCount > 1 ? 's' : ''} carregada{successCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {divergentCount > 0 && (
                    <span className='flex items-center gap-1.5 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800'>
                      <AlertTriangle className='h-3.5 w-3.5 animate-pulse' />
                      {divergentCount} divergência{divergentCount > 1 ? 's' : ''} de CNPJ
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className='flex items-center gap-1.5 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800'>
                      <AlertCircle className='h-3.5 w-3.5' />
                      {errorCount} erro{errorCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className='flex items-center gap-2 flex-wrap'>
                  {successCount > 0 && (
                    <>
                      <Button onClick={handleDownloadExcel} size='sm' className='gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer'>
                        <FileSpreadsheet className='h-4 w-4' />
                        Exportar Excel (.xlsx)
                      </Button>
                      <Button onClick={handleDownloadAllPDFs} size='sm' variant="outline" className='gap-1.5 cursor-pointer' disabled={isDownloading}>
                        {isDownloading ? (
                          <>
                            <Loader2 className='h-4 w-4 animate-spin' />
                            Gerando PDFs...
                          </>
                        ) : (
                          <>
                            <Download className='h-4 w-4 text-indigo-500' />
                            {successCount > 1 ? `Baixar PDFs (${successCount})` : 'Baixar PDF'}
                          </>
                        )}
                      </Button>
                      <Button onClick={handleDownloadAllXMLs} size='sm' variant="outline" className='gap-1.5 font-semibold cursor-pointer' disabled={isDownloading}>
                        <FileCode className='h-4 w-4 text-indigo-600' />
                        Baixar XMLs (.zip)
                      </Button>
                    </>
                  )}
                  <Button onClick={handleClear} variant='outline' size='sm' className="text-zinc-600 dark:text-zinc-400 hover:text-destructive cursor-pointer" title="Limpar todos os arquivos carregados">
                    <X className='h-4 w-4 mr-1' />
                    Limpar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Painel de Indicadores Gerais (KPIs) quando há arquivos carregados */}
        {files.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Total de Notas
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-foreground">{files.length}</span>
                <span className="text-xs text-zinc-500">docs</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Valor Total das Notas
              </span>
              <div className="text-lg sm:text-xl font-extrabold text-indigo-600 dark:text-indigo-400 truncate">
                {formatCurrency(totalValor)}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Peso Líquido Total
              </span>
              <div className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 truncate">
                {totalPesoLiquido > 0
                  ? `${totalPesoLiquido.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
                  : totalPesoBruto > 0
                  ? `${totalPesoBruto.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg (Bruto)`
                  : 'N/A'}
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border shadow-xs ${
              divergentCount > 0
                ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            }`}>
              <span className="text-[11px] font-bold uppercase block mb-1 text-zinc-600 dark:text-zinc-400">
                Chave vs Destinatário
              </span>
              <div className="flex items-center gap-1.5">
                {divergentCount > 0 ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 animate-pulse" />
                    <span className="text-sm font-extrabold text-rose-700 dark:text-rose-300">
                      {divergentCount} divergente{divergentCount > 1 ? 's' : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                      100% Conforme
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results Area with Lateral Vertical Navigation */}
        {files.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
            <div className="flex flex-col lg:flex-row items-start gap-6 w-full">
              {/* Menu Lateral com opções empilhadas verticalmente */}
              <aside className="w-full lg:w-64 xl:w-72 shrink-0 lg:sticky lg:top-4 z-10">
                <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs space-y-1">
                  <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/80 mb-2 flex items-center justify-between">
                    <span>Módulos de Conferência</span>
                    <span className="text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                      {files.length} {files.length === 1 ? 'nota' : 'notas'}
                    </span>
                  </div>

                  <TabsList className='flex flex-col w-full h-auto bg-transparent p-0 gap-1.5'>
                    <TabsTrigger
                      value='list'
                      className={`w-full justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'list'
                          ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-600 dark:text-white font-extrabold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <List className={`h-4 w-4 shrink-0 ${activeTab === 'list' ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
                        <span>Lista ({files.length})</span>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        activeTab === 'list' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {files.length}
                      </span>
                    </TabsTrigger>

                    <TabsTrigger
                      value='reconciliation'
                      className={`w-full justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'reconciliation'
                          ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-600 dark:text-white font-extrabold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Scale className={`h-4 w-4 shrink-0 ${activeTab === 'reconciliation' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                        <span>Conferência c/ Excel</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        activeTab === 'reconciliation' ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                      }`}>
                        Pesagem
                      </span>
                    </TabsTrigger>

                    <TabsTrigger
                      value='dashboard'
                      className={`w-full justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'dashboard'
                          ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-600 dark:text-white font-extrabold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <BarChart3 className={`h-4 w-4 shrink-0 ${activeTab === 'dashboard' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                        <span>Dashboard</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        activeTab === 'dashboard' ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                      }`}>
                        Gráficos
                      </span>
                    </TabsTrigger>

                    <TabsTrigger
                      value='search'
                      className={`w-full justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'search'
                          ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-600 dark:text-white font-extrabold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Search className={`h-4 w-4 shrink-0 ${activeTab === 'search' ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`} />
                        <span>Busca Avançada</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        activeTab === 'search' ? 'bg-white/20 text-white' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                      }`}>
                        Filtros
                      </span>
                    </TabsTrigger>

                    <TabsTrigger
                      value='map'
                      className={`w-full justify-between text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'map'
                          ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-600 dark:text-white font-extrabold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Map className={`h-4 w-4 shrink-0 ${activeTab === 'map' ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`} />
                        <span>Mapa Logístico</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        activeTab === 'map' ? 'bg-white/20 text-white' : 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/40'
                      }`}>
                        Rotas
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </aside>

              {/* Área Principal de Conteúdo das Abas */}
              <div className="flex-1 min-w-0 w-full space-y-4">
                <TabsContent value='list' className='space-y-4 mt-0'>
              {/* Barra de Filtro Rápido em Tempo Real */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <Search className="h-4 w-4 text-zinc-400 shrink-0 ml-1" />
                <input
                  type="text"
                  value={listFilterTerm}
                  onChange={(e) => setListFilterTerm(e.target.value)}
                  placeholder="Filtrar notas por número, chave, emitente, destinatário, transbordo (ex: Pradópolis), terminal..."
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-zinc-400 focus:outline-none"
                />
                {listFilterTerm && (
                  <button
                    type="button"
                    onClick={() => setListFilterTerm('')}
                    className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-0.5 rounded cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
                <span className="text-[11px] text-zinc-500 shrink-0 font-medium border-l pl-2 border-zinc-200 dark:border-zinc-700">
                  {filteredFiles.length} de {files.length} notas
                </span>
              </div>

          {filteredFiles.length === 0 && listFilterTerm && (
            <div className="p-8 text-center rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-sm">
              Nenhuma nota fiscal encontrada para o filtro "{listFilterTerm}".
            </div>
          )}

          {filteredFiles.map((processedFile, index) => {
            const vCNPJ = processedFile.nfeData
              ? processedFile.nfeData.verificacaoCNPJ ||
                verifyChaveCNPJ(
                  processedFile.nfeData.chaveAcesso,
                  processedFile.nfeData.emitente.cnpj,
                  processedFile.nfeData.destinatario.cpfCnpj
                )
              : null
            const isDivergent = vCNPJ?.confrontoChaveXDest === 'DIVERGENTES'

            return (
              <Card
                key={index}
                data-file-index={index}
                className={
                  processedFile.error
                    ? 'border-destructive/50'
                    : isDivergent
                    ? 'border-rose-300 dark:border-rose-900 bg-rose-50/10'
                    : ''
                }
              >
                <CardHeader
                  className='cursor-pointer'
                  onClick={() =>
                    processedFile.nfeData &&
                    setExpandedIndex(expandedIndex === index ? null : index)
                  }
                >
                  <div className='flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-3 min-w-0 flex-1'>
                      {processedFile.error ? (
                        <AlertCircle className='h-5 w-5 flex-shrink-0 text-destructive' />
                      ) : isDivergent ? (
                        <div className="rounded-full bg-rose-100 p-1.5 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 animate-pulse shrink-0">
                          <AlertTriangle className='h-5 w-5' />
                        </div>
                      ) : (
                        <CheckCircle2 className='h-5 w-5 flex-shrink-0 text-green-600' />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className='text-base truncate'>
                            {processedFile.fileName}
                          </CardTitle>
                          {isDivergent && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800">
                              <AlertTriangle className="h-3 w-3 text-rose-600" />
                              CNPJ DIVERGENTE DA CHAVE
                            </span>
                          )}
                          {isDivergent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                speakText(
                                  `Atenção! CNPJ da Chave é divergente do Destinatário na nota fiscal ${
                                    processedFile.nfeData?.numero || processedFile.fileName
                                  }. ${vCNPJ?.details || ''}`
                                )
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-200 text-rose-900 hover:bg-rose-300 dark:bg-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-800 transition-colors cursor-pointer"
                              title="Ouvir aviso de voz para esta nota fiscal"
                            >
                              <Volume2 className="h-3 w-3 text-rose-700 dark:text-rose-300 animate-pulse shrink-0" />
                              Ouvir Alerta
                            </button>
                          )}
                        </div>
                        {processedFile.error ? (
                          <CardDescription className='text-destructive'>
                            {processedFile.error}
                          </CardDescription>
                        ) : processedFile.nfeData ? (
                          <CardDescription>
                            {processedFile.nfeData.tipo === 'NFe' ? 'NF-e' : 'Nota Fiscal'}{" "}
                            - Numero: {processedFile.nfeData.numero || 'N/A'} -{" "}
                            {formatCurrency(processedFile.nfeData.impostos.valorTotal)}
                          </CardDescription>
                        ) : null}
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0 flex-wrap'>
                      {processedFile.nfeData && (
                        <>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadPDF(processedFile)
                            }}
                            size='sm'
                            variant='outline'
                            className='gap-1 text-xs font-semibold h-8 px-2.5 cursor-pointer'
                            title="Baixar DANFE em formato PDF"
                          >
                            <Download className='h-3.5 w-3.5 text-indigo-500' />
                            PDF
                          </Button>
                          {processedFile.xmlContent && (
                            <>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDownloadXML(processedFile)
                                }}
                                size='sm'
                                variant='outline'
                                className='gap-1 text-xs font-semibold h-8 px-2.5 cursor-pointer'
                                title="Baixar arquivo XML original/gerado"
                              >
                                <FileCode className='h-3.5 w-3.5 text-emerald-600' />
                                XML
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedXmlModal({
                                    fileName: processedFile.fileName,
                                    content: processedFile.xmlContent,
                                  })
                                }}
                                size='sm'
                                variant='ghost'
                                className='gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 h-8 px-2 cursor-pointer'
                                title="Visualizar código XML formatado"
                              >
                                <Eye className='h-3.5 w-3.5' />
                                Ver
                              </Button>
                            </>
                          )}
                          <div className="p-1 text-zinc-400 hover:text-zinc-600">
                            {expandedIndex === index ? (
                              <ChevronUp className='h-5 w-5 text-muted-foreground' />
                            ) : (
                              <ChevronDown className='h-5 w-5 text-muted-foreground' />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {expandedIndex === index && processedFile.nfeData && (
                  <CardContent className='space-y-6 border-t pt-6'>
                    {/* Info Geral */}
                    <div className='grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2 lg:grid-cols-4'>
                      <div>
                        <p className='text-xs font-medium uppercase text-muted-foreground'>
                          Numero
                        </p>
                        <p className='text-lg font-semibold'>
                          {processedFile.nfeData.numero || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className='text-xs font-medium uppercase text-muted-foreground'>
                          Serie
                        </p>
                        <p className='text-lg font-semibold'>
                          {processedFile.nfeData.serie || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className='text-xs font-medium uppercase text-muted-foreground'>
                          Data Emissao
                        </p>
                        <p className='text-lg font-semibold'>
                          {processedFile.nfeData.dataEmissao || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className='text-xs font-medium uppercase text-muted-foreground'>
                          Valor Total
                        </p>
                        <p className='text-lg font-semibold text-primary'>
                          {formatCurrency(processedFile.nfeData.impostos.valorTotal)}
                        </p>
                      </div>
                    </div>

                    {/* Validação de CNPJ da Chave x Remetente/Destinatário */}
                    {(() => {
                      const vCNPJ = processedFile.nfeData.verificacaoCNPJ || verifyChaveCNPJ(
                        processedFile.nfeData.chaveAcesso,
                        processedFile.nfeData.emitente.cnpj,
                        processedFile.nfeData.destinatario.cpfCnpj
                      )
                      return (
                        <div className={`p-4 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          vCNPJ.confrontoChaveXDest === 'DIVERGENTES'
                            ? 'bg-rose-100/60 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
                            : vCNPJ.isValid
                            ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900'
                            : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900'
                        }`}>
                          <div className="flex items-start gap-2.5">
                            {vCNPJ.confrontoChaveXDest === 'DIVERGENTES' ? (
                              <div className="rounded-full bg-rose-200 dark:bg-rose-900 p-1 text-rose-700 dark:text-rose-200 animate-pulse shrink-0 mt-0.5">
                                <AlertTriangle className="h-5 w-5" />
                              </div>
                            ) : vCNPJ.isValid ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  Conferência do CNPJ da Chave de Acesso
                                </span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  vCNPJ.confrontoChaveXDest === 'DIVERGENTES'
                                    ? 'bg-rose-600 text-white font-black'
                                    : vCNPJ.isValid
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/80 dark:text-rose-200'
                                }`}>
                                  {vCNPJ.statusLabel}
                                </span>
                              </div>
                              <p className="text-xs text-foreground mt-1">
                                {vCNPJ.details}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                            {vCNPJ.confrontoChaveXDest === 'DIVERGENTES' && (
                              <button
                                type="button"
                                onClick={() =>
                                  speakText(
                                    `Atenção! CNPJ da Chave é divergente do Destinatário no arquivo ${processedFile.fileName}. ${vCNPJ.details}`
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                                Ouvir Alerta
                              </button>
                            )}
                            {vCNPJ.chaveCnpj && (
                              <div className="text-xs font-mono bg-white dark:bg-zinc-900 px-3 py-1.5 rounded border text-zinc-700 dark:text-zinc-300">
                                CNPJ na Chave: <b>{vCNPJ.chaveCnpj}</b>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Informações Logísticas */}
                    {(processedFile.nfeData.terminalEntrega || processedFile.nfeData.transbordo || processedFile.nfeData.retirada || processedFile.nfeData.tipoProduto !== 'OUTRO') && (
                      <div className='grid gap-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20 sm:grid-cols-2 lg:grid-cols-4'>
                        <div className='flex items-start gap-2'>
                          <Package className='mt-0.5 h-4 w-4 text-blue-600' />
                          <div>
                            <p className='text-xs font-medium uppercase text-muted-foreground'>
                              Produto
                            </p>
                            <p className='font-semibold'>
                              {processedFile.nfeData.tipoProduto === 'OUTRO' ? 'Outro' : processedFile.nfeData.tipoProduto}
                            </p>
                          </div>
                        </div>
                        {processedFile.nfeData.terminalEntrega && (
                          <div className='flex items-start gap-2'>
                            <MapPin className='mt-0.5 h-4 w-4 text-green-600' />
                            <div>
                              <p className='text-xs font-medium uppercase text-muted-foreground'>
                                Terminal Entrega
                              </p>
                              <p className='font-semibold text-sm'>
                                {processedFile.nfeData.terminalEntrega}
                              </p>
                            </div>
                          </div>
                        )}
                        {processedFile.nfeData.transbordo && (
                          <div className='flex items-start gap-2'>
                            <Truck className='mt-0.5 h-4 w-4 text-orange-600' />
                            <div>
                              <p className='text-xs font-medium uppercase text-muted-foreground'>
                                Transbordo
                              </p>
                              <p className='font-semibold text-sm'>
                                {processedFile.nfeData.transbordo}
                              </p>
                            </div>
                          </div>
                        )}
                        {processedFile.nfeData.retirada && (
                          <div className='flex items-start gap-2'>
                            <FileArchive className='mt-0.5 h-4 w-4 text-purple-600' />
                            <div>
                              <p className='text-xs font-medium uppercase text-muted-foreground'>
                                Retirada
                              </p>
                              <p className='font-semibold text-sm'>
                                {processedFile.nfeData.retirada}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Emitente e Destinatario */}
                    <div className='grid gap-6 md:grid-cols-2'>
                      <div className='rounded-lg border p-4'>
                        <h3 className='mb-3 font-semibold text-foreground'>Emitente</h3>
                        <div className='space-y-1 text-sm'>
                          <p className='font-medium'>
                            {processedFile.nfeData.emitente.nome || 'N/A'}
                          </p>
                          {processedFile.nfeData.emitente.nomeFantasia && (
                            <p className='text-muted-foreground'>
                              {processedFile.nfeData.emitente.nomeFantasia}
                            </p>
                          )}
                          <p className='text-muted-foreground'>
                            CNPJ: {processedFile.nfeData.emitente.cnpj || 'N/A'}
                          </p>
                          {processedFile.nfeData.emitente.endereco && (
                            <p className='text-muted-foreground'>
                              {processedFile.nfeData.emitente.endereco}
                            </p>
                          )}
                          {(processedFile.nfeData.emitente.cidade ||
                            processedFile.nfeData.emitente.uf) && (
                            <p className='text-muted-foreground'>
                              {processedFile.nfeData.emitente.cidade} -{" "}
                              {processedFile.nfeData.emitente.uf}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className='rounded-lg border p-4'>
                        <h3 className='mb-3 font-semibold text-foreground'>Destinatario</h3>
                        <div className='space-y-1 text-sm'>
                          <p className='font-medium'>
                            {processedFile.nfeData.destinatario.nome || 'N/A'}
                          </p>
                          <p className='text-muted-foreground'>
                            CPF/CNPJ: {processedFile.nfeData.destinatario.cpfCnpj || 'N/A'}
                          </p>
                          {processedFile.nfeData.destinatario.endereco && (
                            <p className='text-muted-foreground'>
                              {processedFile.nfeData.destinatario.endereco}
                            </p>
                          )}
                          {(processedFile.nfeData.destinatario.cidade ||
                            processedFile.nfeData.destinatario.uf) && (
                            <p className='text-muted-foreground'>
                              {processedFile.nfeData.destinatario.cidade} -{" "}
                              {processedFile.nfeData.destinatario.uf}
                            </p>
                          )}
                          {processedFile.nfeData.destinatario.email && (
                            <p className='text-muted-foreground'>
                              {processedFile.nfeData.destinatario.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Itens */}
                    {processedFile.nfeData.itens.length > 0 && (
                      <div>
                        <h3 className='mb-3 font-semibold text-foreground'>
                          Produtos / Servicos
                        </h3>
                        <div className='overflow-x-auto rounded-lg border'>
                          <table className='w-full text-sm'>
                            <thead className='bg-muted'>
                              <tr>
                                <th className='px-4 py-3 text-left font-medium'>Descricao</th>
                                <th className='px-4 py-3 text-center font-medium'>Qtd</th>
                                <th className='px-4 py-3 text-right font-medium'>V. Unit</th>
                                <th className='px-4 py-3 text-right font-medium'>V. Total</th>
                              </tr>
                            </thead>
                            <tbody className='divide-y'>
                              {processedFile.nfeData.itens.map((item, itemIndex) => (
                                <tr key={itemIndex} className='hover:bg-muted/50'>
                                  <td className='px-4 py-3'>
                                    <p className='font-medium'>{item.descricao}</p>
                                    {item.ncm && (
                                      <p className='text-xs text-muted-foreground'>
                                        NCM: {item.ncm}
                                      </p>
                                    )}
                                  </td>
                                  <td className='px-4 py-3 text-center'>
                                    {item.quantidade.toFixed(2)} {item.unidade}
                                  </td>
                                  <td className='px-4 py-3 text-right'>
                                    {formatCurrency(item.valorUnitario)}
                                  </td>
                                  <td className='px-4 py-3 text-right font-medium'>
                                    {formatCurrency(item.valorTotal)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Totais */}
                    <div className='rounded-lg border p-4'>
                      <h3 className='mb-3 font-semibold text-foreground'>Resumo dos Valores</h3>
                      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Produtos/Servicos:</span>
                          <span className='font-medium'>
                            {formatCurrency(processedFile.nfeData.impostos.valorProdutos)}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Desconto:</span>
                          <span className='font-medium'>
                            {formatCurrency(processedFile.nfeData.impostos.desconto)}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Frete:</span>
                          <span className='font-medium'>
                            {formatCurrency(processedFile.nfeData.impostos.valorFrete)}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>ICMS:</span>
                          <span className='font-medium'>
                            {formatCurrency(processedFile.nfeData.impostos.valorICMS)}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>IPI:</span>
                          <span className='font-medium'>
                            {formatCurrency(processedFile.nfeData.impostos.valorIPI)}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground'>Outras Desp.:</span>
                          <span className='font-medium'>
                            {formatCurrency(processedFile.nfeData.impostos.outrasDesp)}
                          </span>
                        </div>
                      </div>
                      <div className='mt-4 flex items-center justify-between border-t pt-4'>
                        <span className='text-lg font-semibold'>Valor Total:</span>
                        <span className='text-2xl font-bold text-primary'>
                          {formatCurrency(processedFile.nfeData.impostos.valorTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Chave de Acesso */}
                    {processedFile.nfeData.chaveAcesso && (
                      <div className='rounded-lg bg-muted/50 p-4'>
                        <p className='text-xs font-medium uppercase text-muted-foreground'>
                          Chave de Acesso
                        </p>
                        <p className='mt-1 break-all font-mono text-sm'>
                          {processedFile.nfeData.chaveAcesso}
                        </p>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
            </TabsContent>

            <TabsContent value='reconciliation'>
              <ExcelReconciliationTab
                files={files}
                speakText={speakText}
                onSelectFile={(index) => {
                  setActiveTab('list')
                  setExpandedIndex(index)
                  setTimeout(() => {
                    const card = document.querySelector(`[data-file-index="${index}"]`)
                    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }, 100)
                }}
              />
            </TabsContent>

            <TabsContent value='dashboard'>
              <Dashboard files={files} />
            </TabsContent>

            <TabsContent value='search'>
              <SearchPanel 
                files={files} 
                onSelectFile={(index) => {
                  setActiveTab('list')
                  setExpandedIndex(index)
                  // Scroll to the selected card
                  setTimeout(() => {
                    const card = document.querySelector(`[data-file-index="${index}"]`)
                    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }, 100)
                }}
              />
            </TabsContent>
            
            <TabsContent value='map'>
              <MapPanel files={files} />
            </TabsContent>

              </div>
            </div>
          </Tabs>
        )}
        </div>

        {/* Módulo MDF-e x EXCEL (Vagões) Preservado */}
        <div className={converterMode === 'mdf-x-excel' ? 'block' : 'hidden'}>
          <MDFExcelComparator onOpenDoc={() => setConverterMode('documentation')} />
        </div>

        {/* Módulo Guia & Regras Preservado */}
        <div className={converterMode === 'documentation' ? 'block' : 'hidden'}>
          <DocumentationPanel />
        </div>
      </div>

      {/* Modal de Visualização de XML */}
      {selectedXmlModal && (
        <Dialog open={!!selectedXmlModal} onOpenChange={(open) => { if (!open) setSelectedXmlModal(null) }}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
            <DialogHeader className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3 pr-6">
                <div>
                  <DialogTitle className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <FileCode className="h-5 w-5 text-emerald-600" />
                    Código XML - {selectedXmlModal.fileName}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                    Estrutura original/gerada da NF-e no padrão nacional SEFAZ.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="my-4 flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-100">
              <pre className="whitespace-pre-wrap break-all leading-relaxed">
                {selectedXmlModal.content}
              </pre>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-xs text-zinc-500">
                {selectedXmlModal.content.length.toLocaleString('pt-BR')} caracteres
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyXml(selectedXmlModal.content)}
                  className="gap-1.5 text-xs font-semibold cursor-pointer"
                >
                  {copiedXml ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {copiedXml ? 'Copiado!' : 'Copiar XML'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([selectedXmlModal.content], { type: 'application/xml;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    const baseName = selectedXmlModal.fileName.replace(/\.(pdf|xml)$/i, '')
                    a.download = `${baseName}.xml`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Baixar XML
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
