'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseNFE, verifyChaveCNPJ, type NFEData } from '@/lib/nfe-parser'
import { parsePdfClientSide } from '@/lib/client-pdf-parser'
import { generatePDF } from '@/lib/pdf-generator'
import { Dashboard } from '@/components/dashboard'
import { SearchPanel } from '@/components/search-panel'
import { MapPanel } from '@/components/map-panel' // Importar o novo painel do mapa
import { PDFToXMLConverter } from '@/components/pdf-to-xml-converter'
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
  Map, // Ícone para a aba do mapa
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

    for (const file of Array.from(selectedFiles)) {
      const fileName = file.name.toLowerCase()

      if (fileName.endsWith('.zip')) {
        try {
          const zipData = await processZipFile(file, typeFilter)
          for (const f of zipData.files) {
            workItems.push({
              fileName: f.fileName,
              filePath: f.originalPath,
              type: f.xmlContent ? 'xml' : 'pdf',
              contentOrBlob: f.xmlContent || f.fileName,
            })
          }
          allOtherFiles.push(...zipData.otherFiles)
        } catch (err) {
          console.error(`[v0] Erro ao processar o arquivo ZIP '${file.name}':`, err)
        }
      } else if (fileName.endsWith('.xml')) {
        if (typeFilter === 'pdf') continue // Filtro apenas PDF ativo
        const content = await file.text()
        workItems.push({
          fileName: file.name,
          filePath: file.name,
          type: 'xml',
          contentOrBlob: content,
        })
      } else if (fileName.endsWith('.pdf')) {
        if (typeFilter === 'xml') continue // Filtro apenas XML ativo
        workItems.push({
          fileName: file.name,
          filePath: file.name,
          type: 'pdf',
          contentOrBlob: file,
        })
      }
    }

    if (workItems.length === 0) {
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

    const results: ProcessedFile[] = []
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

  return (
    <div className='min-h-screen bg-background p-4 md:p-8'>
      <div className={`mx-auto transition-all ${converterMode === 'mdf-x-excel' ? 'max-w-6xl xl:max-w-7xl' : 'max-w-4xl lg:max-w-5xl'}`}>
        <div className='mb-8 text-center'>
          <div className='mb-4 inline-flex items-center justify-center rounded-full bg-primary/10 p-3'>
            <FileText className='h-8 w-8 text-primary' />
          </div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>
            Conversor de Notas Fiscais & MDF-e
          </h1>
          <p className='mt-2 text-muted-foreground'>
            Converta, analise e concilie notas fiscais, manifestos ferroviários e planilhas de forma inteligente
          </p>
        </div>

        {/* Mode Selector */}
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800 flex-wrap justify-center gap-1">
            <button
              onClick={() => setConverterMode('xml-to-pdf')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                converterMode === 'xml-to-pdf'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50 font-bold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }`}
            >
              <FileCode className="h-4 w-4" />
              Painel de Conferência de Notas
            </button>
            <button
              onClick={() => setConverterMode('pdf-to-xml')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                converterMode === 'pdf-to-xml'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50 font-bold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }`}
            >
              <Sparkles className="h-4 w-4 text-indigo-500" />
              PDF para XML & Conferência
            </button>
            <button
              onClick={() => setConverterMode('mdf-x-excel')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                converterMode === 'mdf-x-excel'
                  ? 'bg-indigo-600 text-white shadow-sm font-bold'
                  : 'text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50'
              }`}
            >
              <TrainTrack className="h-4 w-4 text-amber-400" />
              MDF x EXCEL (Vagões)
            </button>
            <button
              onClick={() => setConverterMode('documentation')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                converterMode === 'documentation'
                  ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900 font-bold'
                  : 'text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Guia de Uso & Documentação
            </button>
          </div>
        </div>

        {converterMode === 'documentation' ? (
          <DocumentationPanel />
        ) : converterMode === 'mdf-x-excel' ? (
          <MDFExcelComparator onOpenDoc={() => setConverterMode('documentation')} />
        ) : converterMode === 'pdf-to-xml' ? (
          <PDFToXMLConverter
            onAnalyzeXML={handleAnalyzeGeneratedXML}
            onOpenDocumentation={() => setConverterMode('documentation')}
          />
        ) : (
          <>
            {/* Upload Area */}
            <Card className='mb-6'>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className='text-lg'>Upload de Arquivos</CardTitle>
                  <CardDescription>
                    Arraste arquivos XML, PDF, arquivos ZIP ou pastas contendo notas fiscais
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
                    className="text-xs h-7 px-2.5 gap-1 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                      Tipo de Arquivo a Processar
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
              className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
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
                  <Loader2 className='mb-4 h-12 w-12 animate-spin text-primary' />
                  <p className='text-sm font-medium text-foreground'>Processando arquivos...</p>
                </>
              ) : (
                <>
                  <div className='mb-4 flex items-center gap-3'>
                    <Upload
                      className={`h-10 w-10 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <FileArchive
                      className={`h-10 w-10 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <Folder
                      className={`h-10 w-10 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                  </div>
                  <p className='mb-1 text-sm font-medium text-foreground'>
                    {isDragOver
                      ? 'Solte os arquivos ou pastas aqui'
                      : processFileType === 'xml'
                      ? 'Arraste arquivos XML ou pacotes ZIP aqui (Filtro XML ativo)'
                      : processFileType === 'pdf'
                      ? 'Arraste arquivos PDF ou pacotes ZIP aqui (Filtro PDF ativo)'
                      : 'Arraste arquivos XML, PDF, ZIP ou várias pastas aqui'}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {processFileType === 'xml'
                      ? 'Filtro ativo: apenas arquivos .XML (ou ZIPs contendo XML) serão processados.'
                      : processFileType === 'pdf'
                      ? 'Filtro ativo: apenas arquivos .PDF (ou ZIPs contendo PDF) serão processados.'
                      : 'ou clique para selecionar (suporta múltiplos arquivos, PDFs e pastas)'}
                  </p>
                </>
              )}
            </div>

            {files.length > 0 && (
              <div className='mt-4 flex items-center justify-between'>
                <div className='flex items-center gap-4 text-sm'>
                  {successCount > 0 && (
                    <span className='flex items-center gap-1 text-green-600'>
                      <CheckCircle2 className='h-4 w-4' />
                      {successCount} processado{successCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className='flex items-center gap-1 text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      {errorCount} erro{errorCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                {successCount > 0 && (
                    <>
                        <Button onClick={handleDownloadExcel} size='sm' className='gap-2'>
                            <FileSpreadsheet className='h-4 w-4' />
                            Excel
                        </Button>
                        <Button onClick={handleDownloadAllPDFs} size='sm' className='gap-2' disabled={isDownloading}>
                        {isDownloading ? (
                            <>
                            <Loader2 className='h-4 w-4 animate-spin' />
                            Gerando...
                            </>
                        ) : (
                            <>
                            <Download className='h-4 w-4' />
                            {successCount > 1 ? `PDFs (${successCount})` : 'PDF'}
                            </>
                        )}
                        </Button>
                    </>
                  )}
                  <Button onClick={handleClear} variant='outline' size='sm'>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Area */}
        {files.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
            <TabsList className='mb-4 grid w-full grid-cols-4'>
              <TabsTrigger value='list' className='gap-2'>
                <List className='h-4 w-4' />
                Lista
              </TabsTrigger>
              <TabsTrigger value='dashboard' className='gap-2'>
                <BarChart3 className='h-4 w-4' />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value='search' className='gap-2'>
                <Search className='h-4 w-4' />
                Pesquisa
              </TabsTrigger>
               <TabsTrigger value='map' className='gap-2'>
                <Map className='h-4 w-4' />
                Mapa
              </TabsTrigger>
            </TabsList>

            <TabsContent value='list' className='space-y-4'>
          {files.map((processedFile, index) => {
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
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      {processedFile.error ? (
                        <AlertCircle className='h-5 w-5 flex-shrink-0 text-destructive' />
                      ) : isDivergent ? (
                        <div className="rounded-full bg-rose-100 p-1.5 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 animate-pulse shrink-0">
                          <AlertTriangle className='h-5 w-5' />
                        </div>
                      ) : (
                        <CheckCircle2 className='h-5 w-5 flex-shrink-0 text-green-600' />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className='text-base'>
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
                    <div className='flex items-center gap-2'>
                      {processedFile.nfeData && (
                        <>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadPDF(processedFile)
                            }}
                            size='sm'
                            variant='outline'
                            className='gap-2'
                          >
                            <Download className='h-4 w-4' />
                            PDF
                          </Button>
                          {expandedIndex === index ? (
                            <ChevronUp className='h-5 w-5 text-muted-foreground' />
                          ) : (
                            <ChevronDown className='h-5 w-5 text-muted-foreground' />
                          )}
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
                    const card = document.querySelector(`[data-file-index="${index}"]`);
                    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100)
                }}
              />
            </TabsContent>
            
            <TabsContent value='map'>
              <MapPanel files={files} />
            </TabsContent>

          </Tabs>
        )}
          </>
        )}
      </div>
    </div>
  )
}
