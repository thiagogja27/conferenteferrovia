'use client'

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { type NFEData } from "@/lib/nfe-parser"
import { Search, FileText, FileSpreadsheet } from "lucide-react"
import * as XLSX from 'xlsx'

interface ProcessedFile {
  fileName: string
  nfeData: NFEData | null
}

interface SearchPanelProps {
  files: Array<ProcessedFile>
  onSelectFile?: (index: number) => void
}

interface SearchResult {
  fileIndex: number
  fileName: string
  nfeNumero: string
  field: string
  matchedText: string
  contextWords: string[]
}

export function SearchPanel({ files, onSelectFile }: SearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [searchMode, setSearchMode] = useState<"exact" | "context">("exact")
  const [results, setResults] = useState<SearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [dataChegada, setDataChegada] = useState("")
  const [placaPrefixo, setPlacaPrefixo] = useState("")
  const [terminal, setTerminal] = useState("")

  const searchableContent = useMemo(() => {
    return files.map((file, index) => {
      if (!file.nfeData) return { index, fileName: file.fileName, fields: [] }

      const nfe = file.nfeData
      const fields: { name: string; value: string }[] = []

      fields.push({ name: "Numero", value: nfe.numero })
      fields.push({ name: "Serie", value: nfe.serie })
      fields.push({ name: "Chave de Acesso", value: nfe.chaveAcesso })
      fields.push({ name: "Natureza da Operacao", value: nfe.naturezaOperacao })
      fields.push({ name: "Emitente - Nome", value: nfe.emitente.nome })
      fields.push({ name: "Emitente - CNPJ", value: nfe.emitente.cnpj })
      fields.push({ name: "Emitente - Cidade", value: nfe.emitente.cidade })
      fields.push({ name: "Destinatario - Nome", value: nfe.destinatario.nome })
      fields.push({ name: "Destinatario - CNPJ", value: nfe.destinatario.cpfCnpj })
      fields.push({ name: "Destinatario - Cidade", value: nfe.destinatario.cidade })
      fields.push({ name: "Transportador - Nome", value: nfe.transportador.nome })
      fields.push({ name: "Transportador - Placa", value: nfe.transportador.placaVeiculo })
      fields.push({ name: "Terminal de Entrega", value: nfe.terminalEntrega })
      fields.push({ name: "Transbordo", value: nfe.transbordo })
      fields.push({ name: "Retirada", value: nfe.retirada })
      fields.push({ name: "Tipo de Produto", value: nfe.tipoProduto })
      nfe.itens.forEach((item, i) => {
        fields.push({ name: `Produto ${i + 1} - Descricao`, value: item.descricao })
        fields.push({ name: `Produto ${i + 1} - NCM`, value: item.ncm })
        fields.push({ name: `Produto ${i + 1} - Codigo`, value: item.codigo })
      })
      fields.push({ name: "Informacoes Complementares", value: nfe.informacoesComplementares })

      return {
        index,
        fileName: file.fileName,
        nfeNumero: nfe.numero,
        fields: fields.filter((f) => f.value && f.value.trim() !== ""),
      }
    })
  }, [files])

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setResults([])
      setHasSearched(true)
      return
    }

    const term = searchTerm.toUpperCase()
    const found: SearchResult[] = []

    searchableContent.forEach((content) => {
      if (content.fields.length === 0) return

      content.fields.forEach((field) => {
        const value = field.value.toUpperCase()

        if (searchMode === "exact") {
          if (value.includes(term)) {
            found.push({
              fileIndex: content.index,
              fileName: content.fileName,
              nfeNumero: content.nfeNumero || "N/A",
              field: field.name,
              matchedText: field.value,
              contextWords: [],
            })
          }
        } else {
          const words = value.split(/\s+/)
          const termIndex = words.findIndex((w) => w.includes(term))

          if (termIndex !== -1) {
            const originalWords = field.value.split(/\s+/)
            const contextWords = originalWords.slice(termIndex, termIndex + 6)
            found.push({
              fileIndex: content.index,
              fileName: content.fileName,
              nfeNumero: content.nfeNumero || "N/A",
              field: field.name,
              matchedText: originalWords[termIndex],
              contextWords,
            })
          }
        }
      })
    })

    setResults(found)
    setHasSearched(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  const handleConfirmAndExport = () => {
    if (results.length === 0) return

    const uniqueFileIndexes = [...new Set(results.map(r => r.fileIndex))]
    const filesToExport = uniqueFileIndexes.map(index => files[index as number]).filter(f => f.nfeData !== null)

    if (filesToExport.length === 0) return

    const terminalHeader = [terminal, "", "", "", "", "", ""]
    const headers = [
      "DATA CHEGADA",
      "PLACA/PREFIXO",
      "DATA DA EMISSÃO",
      "Nº DA CHAVE DE ACESSO FORNECEDOR",
      "CNPJ FORNECEDOR (FORMULA)",
      "Numero DANFE (FORMULA)",
      "Série DANFE (FORMULA)",
    ]

    const dataToExport = filesToExport.map((file, i) => {
      const rowIndex = i + 3 // 1-based: 1=Terminal, 2=Headers, 3=Data starts
      const chaveAcessoCell = `D${rowIndex}`
      return [
        dataChegada,
        placaPrefixo,
        file.nfeData!.dataEmissao,
        file.nfeData!.chaveAcesso,
        { f: `=MID(${chaveAcessoCell}, 7, 14)` },
        { f: `=MID(${chaveAcessoCell}, 26, 9)` },
        { f: `=MID(${chaveAcessoCell}, 23, 3)` },
      ]
    })
    
    const worksheetData = [terminalHeader, headers, ...dataToExport];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    
    // Merge the terminal header
    worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pesquisa NFE")

    XLSX.writeFile(workbook, `relatorio_nfe_${terminal}_${Date.now()}.xlsx`)

    setIsExportDialogOpen(false)
    setDataChegada("")
    setPlacaPrefixo("")
    setTerminal("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="h-5 w-5" />
          Pesquisa nas Notas
        </CardTitle>
        <CardDescription>
          Pesquise por palavra exata ou por contexto (mostra as 5 palavras seguintes)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="Digite o termo de pesquisa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={searchMode === "exact" ? "default" : "outline"}
              onClick={() => setSearchMode("exact")}
              size="sm"
            >
              Exata
            </Button>
            <Button
              variant={searchMode === "context" ? "default" : "outline"}
              onClick={() => setSearchMode("context")}
              size="sm"
            >
              Contexto
            </Button>
          </div>
          <Button onClick={handleSearch}>
            <Search className="mr-2 h-4 w-4" />
            Pesquisar
          </Button>
          {results.length > 0 && (
             <Button onClick={() => setIsExportDialogOpen(true)} variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Exportar Excel
            </Button>
          )}
        </div>

        {/* Dialog para inserir dados da exportação */}
        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Exportar Relatório</DialogTitle>
              <DialogDescription>
                Preencha os campos abaixo para incluí-los no relatório.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="terminal" className="text-right">
                  TERMINAL
                </Label>
                <Input
                  id="terminal"
                  value={terminal}
                  onChange={(e) => setTerminal(e.target.value)}
                  className="col-span-3"
                  placeholder="Ex: TEG, TEAG"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="data-chegada" className="text-right">
                  DATA CHEGADA
                </Label>
                <Input
                  id="data-chegada"
                  value={dataChegada}
                  onChange={(e) => setDataChegada(e.target.value)}
                  className="col-span-3"
                  placeholder="DD/MM/AAAA"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="placa-prefixo" className="text-right">
                  PLACA/PREFIXO
                </Label>
                <Input
                  id="placa-prefixo"
                  value={placaPrefixo}
                  onChange={(e) => setPlacaPrefixo(e.target.value)}
                  className="col-span-3"
                  placeholder="Ex: U78"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleConfirmAndExport}>Confirmar e Exportar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {hasSearched && (
          <div className="mt-4">
            {results.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Nenhum resultado encontrado para &quot;{searchTerm}&quot;
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {results.length} resultado{results.length !== 1 && "s"} encontrado{results.length !== 1 && "s"}
                </p>
                <div className="max-h-[400px] space-y-2 overflow-y-auto">
                  {results.map((result, i) => (
                    <div
                      key={i}
                      className="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted/50"
                      onClick={() => onSelectFile?.(result.fileIndex)}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{result.fileName}</span>
                            <span className="text-xs text-muted-foreground">
                              NF {result.nfeNumero}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{result.field}</p>
                          {searchMode === "exact" ? (
                            <p className="mt-1 break-words text-sm">
                              {highlightText(result.matchedText, searchTerm)}
                            </p>
                          ) : (
                            <p className="mt-1 break-words text-sm">
                              <span className="font-semibold text-primary">
                                {result.contextWords[0]}
                              </span>{" "}
                              {result.contextWords.slice(1).join(" ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function highlightText(text: string, term: string) {
  if (!term) return text

  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, "gi"))

  return parts.map((part, i) =>
    part.toUpperCase() === term.toUpperCase() ? (
      <span key={i} className="bg-yellow-200 font-semibold text-yellow-900">
        {part}
      </span>
    ) : (
      part
    )
  )
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
