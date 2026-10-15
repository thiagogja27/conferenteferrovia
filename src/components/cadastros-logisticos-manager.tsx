'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Building2,
  Train,
  Plus,
  Search,
  Trash2,
  Edit2,
  CheckCircle2,
  Info,
  ShieldCheck,
  Copy,
  Check,
  ArrowRight,
  Database,
  Filter,
  RefreshCw,
  Tag,
  MapPin,
} from 'lucide-react'
import {
  getAllDestinatarios,
  getCustomDestinatarios,
  saveCustomDestinatario,
  deleteCustomDestinatario,
  getAllTransbordos,
  getCustomTransbordos,
  saveCustomTransbordo,
  deleteCustomTransbordo,
  subscribeCadastrosChanges,
  saveDestinatarioContract,
  CONTRATOS_DESTINATARIO,
  type CadastroDestinatario,
  type CadastroTransbordo,
  type ContratoDestinatario,
} from '@/lib/cadastros-logisticos-service'
import { formatCNPJ } from '@/lib/destinatario-utils'

const normalizeSearchText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()

interface BulkDestinatarioRow {
  nome: string
  cnpj: string
  nomenclatura: string
  nomenclaturaRemetente: string
  contrato: string
  line: number
}

function splitDelimitedRow(line: string, delimiter: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === delimiter && !quoted) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  values.push(value.trim())
  return values
}

interface CadastrosLogisticosManagerProps {
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}

export function CadastrosLogisticosManager({ onNotify }: CadastrosLogisticosManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'destinatarios' | 'transbordos'>('destinatarios')
  const [searchFilter, setSearchFilter] = useState('')
  const [originFilter, setOriginFilter] = useState<'TODOS' | 'CUSTOM' | 'SISTEMA'>('TODOS')
  const [isBulkDestModalOpen, setIsBulkDestModalOpen] = useState(false)
  const [bulkDestRows, setBulkDestRows] = useState<BulkDestinatarioRow[]>(
    () => Array.from({ length: 5 }, () => ({ nome: '', cnpj: '', nomenclatura: '', nomenclaturaRemetente: '', contrato: '', line: 0 }))
  )
  const [bulkDestError, setBulkDestError] = useState('')
  const [isSavingBulkDest, setIsSavingBulkDest] = useState(false)
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false)
  const [bulkEditFilter, setBulkEditFilter] = useState('')
  const [bulkEditSelectedIds, setBulkEditSelectedIds] = useState<string[]>([])
  const [bulkEditNameEnabled, setBulkEditNameEnabled] = useState(false)
  const [bulkEditNomenclatureEnabled, setBulkEditNomenclatureEnabled] = useState(false)
  const [bulkEditSenderNomenclatureEnabled, setBulkEditSenderNomenclatureEnabled] = useState(false)
  const [bulkEditContractEnabled, setBulkEditContractEnabled] = useState(false)
  const [bulkEditName, setBulkEditName] = useState('')
  const [bulkEditNomenclature, setBulkEditNomenclature] = useState('')
  const [bulkEditSenderNomenclature, setBulkEditSenderNomenclature] = useState('')
  const [bulkEditContract, setBulkEditContract] = useState<ContratoDestinatario | ''>('')
  const [bulkEditError, setBulkEditError] = useState('')

  // Listas locais de dados
  const [destinatarios, setDestinatarios] = useState<CadastroDestinatario[]>([])
  const [transbordos, setTransbordos] = useState<CadastroTransbordo[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modais de Criação / Edição
  const [isDestModalOpen, setIsDestModalOpen] = useState(false)
  const [isTransModalOpen, setIsTransModalOpen] = useState(false)
  const [editingDest, setEditingDest] = useState<CadastroDestinatario | null>(null)
  const [editingTrans, setEditingTrans] = useState<CadastroTransbordo | null>(null)

  // Formulário Destinatário
  const [destNome, setDestNome] = useState('')
  const [destNomenclatura, setDestNomenclatura] = useState('')
  const [destNomenclaturaRemetente, setDestNomenclaturaRemetente] = useState('')
  const [destCnpj, setDestCnpj] = useState('')
  const [destContrato, setDestContrato] = useState<ContratoDestinatario | ''>('')
  const [destCnpjsAdicionais, setDestCnpjsAdicionais] = useState('')
  const [destAliases, setDestAliases] = useState('')
  const [destCidade, setDestCidade] = useState('')
  const [destUf, setDestUf] = useState('')
  const [destObservacoes, setDestObservacoes] = useState('')

  // Formulário Transbordo
  const [transNome, setTransNome] = useState('')
  const [transCnpj, setTransCnpj] = useState('')
  const [transCidade, setTransCidade] = useState('')
  const [transUf, setTransUf] = useState('')
  const [transOperadora, setTransOperadora] = useState<'RUMO' | 'VLI' | 'OUTRA' | string>('RUMO')
  const [transAliases, setTransAliases] = useState('')
  const [transObservacoes, setTransObservacoes] = useState('')

  // Carrega e assina atualizações
  const reloadData = () => {
    setDestinatarios(getAllDestinatarios())
    setTransbordos(getAllTransbordos())
  }

  useEffect(() => {
    reloadData()
    const unsubscribe = subscribeCadastrosChanges(() => {
      reloadData()
    })
    return () => unsubscribe()
  }, [])

  // Limpa formulário de Destinatário
  const openNewDestModal = () => {
    setEditingDest(null)
    setDestNome('')
    setDestNomenclatura('')
    setDestNomenclaturaRemetente('')
    setDestCnpj('')
    setDestContrato('')
    setDestCnpjsAdicionais('')
    setDestAliases('')
    setDestCidade('')
    setDestUf('')
    setDestObservacoes('')
    setIsDestModalOpen(true)
  }

  const openEditDestModal = (dest: CadastroDestinatario) => {
    setEditingDest(dest)
    setDestNome(dest.nome)
    setDestNomenclatura(dest.nomenclatura || '')
    setDestNomenclaturaRemetente(dest.nomenclaturaRemetente || '')
    setDestCnpj(dest.cnpjPrincipal)
    setDestContrato(dest.contrato || '')
    setDestCnpjsAdicionais((dest.cnpjsAdicionais || []).join(', '))
    setDestAliases((dest.aliases || []).join(', '))
    setDestCidade(dest.cidade || '')
    setDestUf(dest.uf || '')
    setDestObservacoes(dest.observacoes || '')
    setIsDestModalOpen(true)
  }

  // Salvar Destinatário
  const handleSaveDestinatario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!destNome.trim()) {
      onNotify?.('Informe o nome ou razão social do destinatário.', 'error')
      return
    }
    const cleanCnpj = destCnpj.replace(/\D/g, '')
    if (cleanCnpj.length !== 14 && cleanCnpj.length !== 11) {
      onNotify?.('Informe um CNPJ válido com 14 dígitos (ou CPF com 11 dígitos).', 'error')
      return
    }

    const adCnpjs = destCnpjsAdicionais
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const aliases = destAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    let recipientChanged = false
    try {
      await saveDestinatarioContract(cleanCnpj, destContrato)
      recipientChanged =
        !editingDest?.isSistema ||
        destNome.trim().toUpperCase() !== editingDest.nome ||
        destNomenclatura.trim() !== (editingDest.nomenclatura || '') ||
        destNomenclaturaRemetente.trim() !== (editingDest.nomenclaturaRemetente || '') ||
        adCnpjs.join(',') !== (editingDest.cnpjsAdicionais || []).join(',') ||
        aliases.join(',') !== (editingDest.aliases || []).join(',') ||
        destCidade.trim() !== (editingDest.cidade || '') ||
        destUf.trim().toUpperCase() !== (editingDest.uf || '') ||
        destObservacoes.trim() !== (editingDest.observacoes || '')

      if (recipientChanged) {
        await saveCustomDestinatario({
          id: editingDest && !editingDest.isSistema ? editingDest.id : undefined,
          nome: destNome.trim().toUpperCase(),
          nomenclatura: destNomenclatura.trim(),
          nomenclaturaRemetente: destNomenclaturaRemetente.trim(),
          cnpjPrincipal: formatCNPJ(destCnpj),
          cnpjsAdicionais: adCnpjs,
          aliases,
          cidade: destCidade.trim(),
          uf: destUf.trim().toUpperCase(),
          observacoes: destObservacoes.trim(),
          ativo: true,
        })
      }

    } catch (err) {
      onNotify?.(
        err instanceof Error
          ? `Erro ao salvar/sincronizar destinatário: ${err.message}`
          : 'Erro ao salvar/sincronizar destinatário.',
        'error'
      )
      return
    }

    setIsDestModalOpen(false)
    reloadData()
    onNotify?.(editingDest?.isSistema && recipientChanged
      ? `Personalização salva. O nome "${destNome.trim().toUpperCase()}" substituirá o padrão nas notas correspondentes.`
      : `Destinatário "${destNome.trim().toUpperCase()}" e contrato salvos com sucesso.`,
    'success')
  }

  const updateBulkDestCell = (
    rowIndex: number,
    column: keyof Omit<BulkDestinatarioRow, 'line'>,
    value: string
  ) => {
    setBulkDestError('')
    setBulkDestRows((current) => {
      const updated = [...current]
      while (updated.length <= rowIndex) {
        updated.push({ nome: '', cnpj: '', nomenclatura: '', nomenclaturaRemetente: '', contrato: '', line: 0 })
      }
      updated[rowIndex] = { ...updated[rowIndex], [column]: value }
      return updated
    })
  }

  const handleBulkDestPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startColumn: number
  ) => {
    const pastedText = event.clipboardData.getData('text')
    if (!pastedText.includes('\t') && !pastedText.includes('\n') && !pastedText.includes(';')) return

    event.preventDefault()
    setBulkDestError('')
    const lines = pastedText.trimEnd().split(/\r?\n/)
    const delimiter = pastedText.includes('\t') ? '\t' : pastedText.includes(';') ? ';' : ','
    const matrix = lines.map((line) => splitDelimitedRow(line, delimiter))
    const firstRow = matrix[0]?.map(normalizeSearchText) || []
    const hasHeader = startRow === 0 && startColumn === 0 &&
      firstRow.some((cell) => cell.includes('CNPJ')) &&
      firstRow.some((cell) => cell.includes('DESTINATARIO') || cell.includes('NOME'))
    const rowsToPaste = hasHeader ? matrix.slice(1) : matrix
    const columns: Array<keyof Omit<BulkDestinatarioRow, 'line'>> = [
      'nome',
      'cnpj',
      'nomenclatura',
      'nomenclaturaRemetente',
      'contrato',
    ]

    setBulkDestRows((current) => {
      const updated = [...current]
      rowsToPaste.forEach((values, rowOffset) => {
        const targetRow = startRow + rowOffset
        while (updated.length <= targetRow) {
          updated.push({ nome: '', cnpj: '', nomenclatura: '', nomenclaturaRemetente: '', contrato: '', line: 0 })
        }
        values.forEach((value, columnOffset) => {
          const targetColumn = columns[startColumn + columnOffset]
          if (targetColumn) updated[targetRow] = { ...updated[targetRow], [targetColumn]: value }
        })
      })
      return updated
    })
  }

  const handleBulkSaveDestinatarios = async () => {
    const rows: BulkDestinatarioRow[] = bulkDestRows
      .map((row, index) => ({ ...row, line: index + 1 }))
      .filter((row) => row.nome.trim() || row.cnpj.trim() || row.nomenclatura.trim() || row.nomenclaturaRemetente.trim() || row.contrato.trim())
    if (rows.length === 0) {
      const message = 'Preencha ao menos uma linha com destinatário e CNPJ/CPF.'
      setBulkDestError(message)
      onNotify?.(message, 'error')
      return
    }

    const invalidRows: string[] = []
    const seenCnpjs = new Set<string>()
    rows.forEach((row) => {
      const cleanCnpj = row.cnpj.replace(/\D/g, '')
      if (!row.nome || (cleanCnpj.length !== 14 && cleanCnpj.length !== 11)) {
        invalidRows.push(`linha ${row.line}: informe nome e CNPJ/CPF válido`)
      } else if (seenCnpjs.has(cleanCnpj)) {
        invalidRows.push(`linha ${row.line}: CNPJ/CPF duplicado na lista`)
      } else {
        seenCnpjs.add(cleanCnpj)
      }
      if (row.contrato && !CONTRATOS_DESTINATARIO.includes(row.contrato.toUpperCase() as ContratoDestinatario)) {
        invalidRows.push(`linha ${row.line}: contrato "${row.contrato}" não reconhecido`)
      }
    })

    if (invalidRows.length > 0) {
      const message = `Revise a lista: ${invalidRows.slice(0, 5).join('; ')}${invalidRows.length > 5 ? '; ...' : ''}.`
      setBulkDestError(message)
      onNotify?.(message, 'error')
      return
    }

    setBulkDestError('')
    setIsSavingBulkDest(true)
    let processedCount = 0
    const saveErrors: string[] = []
    try {
      for (const row of rows) {
        const cleanCnpj = row.cnpj.replace(/\D/g, '')
        const existing = getAllDestinatarios().find(
          (recipient) => recipient.cnpjPrincipal.replace(/\D/g, '') === cleanCnpj
        )
        const recipientSave = saveCustomDestinatario({
          id: existing && !existing.isSistema ? existing.id : undefined,
          nome: row.nome.trim().toUpperCase(),
          nomenclatura: row.nomenclatura.trim() || existing?.nomenclatura || '',
          nomenclaturaRemetente: row.nomenclaturaRemetente.trim() || existing?.nomenclaturaRemetente || '',
          cnpjPrincipal: formatCNPJ(row.cnpj),
          cnpjsAdicionais: existing?.cnpjsAdicionais || [],
          aliases: existing?.aliases || [],
          cidade: existing?.cidade || '',
          uf: existing?.uf || '',
          observacoes: existing?.observacoes || '',
          ativo: true,
        })
        try {
          await recipientSave
        } catch (err) {
          saveErrors.push(`${row.nome}: ${err instanceof Error ? err.message : 'falha ao sincronizar destinatário'}`)
        }
        if (row.contrato || existing?.contrato) {
          try {
            await saveDestinatarioContract(
              cleanCnpj,
              row.contrato
                ? row.contrato.toUpperCase() as ContratoDestinatario
                : existing?.contrato || ''
            )
          } catch (err) {
            saveErrors.push(`${row.nome}: ${err instanceof Error ? err.message : 'falha ao sincronizar contrato'}`)
          }
        }
        processedCount += 1
      }
      reloadData()
      if (saveErrors.length > 0) {
        console.error('Erros na sincronização dos destinatários em massa:', saveErrors)
        const message = `${processedCount} linha(s) processada(s), mas houve falha ao sincronizar com o banco. A grade foi mantida para você poder revisar e tentar novamente. ${saveErrors.slice(0, 3).join('; ')}${saveErrors.length > 3 ? '; ...' : ''}`
        setBulkDestError(message)
        onNotify?.(message, 'warning')
      } else {
        setBulkDestRows(Array.from({ length: 5 }, () => ({ nome: '', cnpj: '', nomenclatura: '', nomenclaturaRemetente: '', contrato: '', line: 0 })))
        setBulkDestError('')
        setIsBulkDestModalOpen(false)
        onNotify?.(`${processedCount} destinatário(s) cadastrado(s)/atualizado(s) com sucesso.`, 'success')
      }
    } catch (err) {
      reloadData()
      const message = `${processedCount} destinatário(s) foram processados antes da falha. A grade foi mantida; corrija ou tente novamente. ${
        err instanceof Error ? err.message : 'Ocorreu um erro ao salvar a lista.'
      }`
      setBulkDestError(message)
      onNotify?.(message, 'error')
    } finally {
      setIsSavingBulkDest(false)
    }
  }

  // Deletar Destinatário
  const handleDeleteDestinatario = (id: string, nome: string) => {
    if (window.confirm(`Tem certeza que deseja remover o destinatário "${nome}" dos cadastros personalizados?`)) {
      deleteCustomDestinatario(id)
      reloadData()
      onNotify?.(`Destinatário "${nome}" removido com sucesso.`, 'info')
    }
  }

  // Limpa formulário de Transbordo
  const openNewTransModal = () => {
    setEditingTrans(null)
    setTransNome('')
    setTransCnpj('')
    setTransCidade('')
    setTransUf('')
    setTransOperadora('RUMO')
    setTransAliases('')
    setTransObservacoes('')
    setIsTransModalOpen(true)
  }

  const openEditTransModal = (trans: CadastroTransbordo) => {
    setEditingTrans(trans)
    setTransNome(trans.nome)
    setTransCnpj(trans.cnpj || '')
    setTransCidade(trans.cidade || '')
    setTransUf(trans.uf || '')
    setTransOperadora(trans.operadora || 'RUMO')
    setTransAliases((trans.aliases || []).join(', '))
    setTransObservacoes(trans.observacoes || '')
    setIsTransModalOpen(true)
  }

  // Salvar Transbordo
  const handleSaveTransbordo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!transNome.trim()) {
      onNotify?.('Informe o nome ou identificação do transbordo.', 'error')
      return
    }

    const aliases = transAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    saveCustomTransbordo({
      id: editingTrans?.id,
      nome: transNome.trim().toUpperCase(),
      cnpj: transCnpj ? formatCNPJ(transCnpj) : undefined,
      cidade: transCidade.trim(),
      uf: transUf.trim().toUpperCase(),
      operadora: transOperadora,
      aliases,
      observacoes: transObservacoes.trim(),
      ativo: true,
    })

    setIsTransModalOpen(false)
    reloadData()
    onNotify?.(
      `Transbordo "${transNome.trim().toUpperCase()}" salvo com sucesso! O sistema passará a reconhecê-lo automaticamente nas notas.`,
      'success'
    )
  }

  // Deletar Transbordo
  const handleDeleteTransbordo = (id: string, nome: string) => {
    if (window.confirm(`Tem certeza que deseja remover o transbordo "${nome}" dos cadastros personalizados?`)) {
      deleteCustomTransbordo(id)
      reloadData()
      onNotify?.(`Transbordo "${nome}" removido com sucesso.`, 'info')
    }
  }

  // Copiar CNPJ
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filtragem dos Destinatários
  const filteredDestinatarios = useMemo(() => {
    return destinatarios.filter((d) => {
      if (originFilter === 'CUSTOM' && d.isSistema) return false
      if (originFilter === 'SISTEMA' && !d.isSistema) return false

      if (!searchFilter.trim()) return true
      const q = normalizeSearchText(searchFilter.trim())
      const digitsQuery = searchFilter.replace(/\D/g, '')
      const inNome = normalizeSearchText(d.nome).includes(q)
      const inNomenclatura = normalizeSearchText(d.nomenclatura || '').includes(q)
      const inSenderNomenclature = normalizeSearchText(d.nomenclaturaRemetente || '').includes(q)
      const inCnpj = Boolean(digitsQuery) && (d.cnpjPrincipal || '').replace(/\D/g, '').includes(digitsQuery)
      const inCnpjsAdicionais = Boolean(digitsQuery) &&
        (d.cnpjsAdicionais || []).some((cnpj) => cnpj.replace(/\D/g, '').includes(digitsQuery))
      const inAliases = (d.aliases || []).some((a) => normalizeSearchText(a).includes(q))
      const inCidade = normalizeSearchText(d.cidade || '').includes(q)
      return inNome || inNomenclatura || inSenderNomenclature || inCnpj || inCnpjsAdicionais || inAliases || inCidade
    })
  }, [destinatarios, searchFilter, originFilter])

  const bulkEditFilteredDestinatarios = useMemo(() => {
    const query = normalizeSearchText(bulkEditFilter.trim())
    if (!query) return destinatarios
    const digitsQuery = bulkEditFilter.replace(/\D/g, '')
    return destinatarios.filter((recipient) =>
      normalizeSearchText(recipient.nome).includes(query) ||
      normalizeSearchText(recipient.nomenclatura || '').includes(query) ||
      normalizeSearchText(recipient.nomenclaturaRemetente || '').includes(query) ||
      (recipient.aliases || []).some((alias) => normalizeSearchText(alias).includes(query)) ||
      (recipient.cidade && normalizeSearchText(recipient.cidade).includes(query)) ||
      (digitsQuery && (
        recipient.cnpjPrincipal.replace(/\D/g, '').includes(digitsQuery) ||
        (recipient.cnpjsAdicionais || []).some((cnpj) => cnpj.replace(/\D/g, '').includes(digitsQuery))
      ))
    )
  }, [destinatarios, bulkEditFilter])

  const openBulkEditModal = () => {
    setBulkEditFilter('')
    setBulkEditSelectedIds([])
    setBulkEditNameEnabled(false)
    setBulkEditNomenclatureEnabled(false)
    setBulkEditSenderNomenclatureEnabled(false)
    setBulkEditContractEnabled(false)
    setBulkEditName('')
    setBulkEditNomenclature('')
    setBulkEditSenderNomenclature('')
    setBulkEditContract('')
    setBulkEditError('')
    setIsBulkEditModalOpen(true)
  }

  const handleBulkEditDestinatarios = async () => {
    const selected = destinatarios.filter((recipient) => bulkEditSelectedIds.includes(recipient.id))
    if (selected.length === 0) {
      setBulkEditError('Selecione ao menos um destinatário.')
      return
    }
    if (!bulkEditNameEnabled && !bulkEditNomenclatureEnabled && !bulkEditSenderNomenclatureEnabled && !bulkEditContractEnabled) {
      setBulkEditError('Selecione ao menos uma informação para aplicar.')
      return
    }
    if (bulkEditNameEnabled && !bulkEditName.trim()) {
      setBulkEditError('Informe o novo nome do destinatário.')
      return
    }

    setIsSavingBulkDest(true)
    setBulkEditError('')
    const errors: string[] = []
    let processed = 0
    try {
      for (const recipient of selected) {
        if (bulkEditNameEnabled || bulkEditNomenclatureEnabled || bulkEditSenderNomenclatureEnabled) {
          try {
            await saveCustomDestinatario({
              id: recipient.isSistema ? undefined : recipient.id,
              nome: bulkEditNameEnabled ? bulkEditName.trim().toUpperCase() : recipient.nome,
              nomenclatura: bulkEditNomenclatureEnabled
                ? bulkEditNomenclature.trim()
                : recipient.nomenclatura || '',
              nomenclaturaRemetente: bulkEditSenderNomenclatureEnabled
                ? bulkEditSenderNomenclature.trim()
                : recipient.nomenclaturaRemetente || '',
              cnpjPrincipal: recipient.cnpjPrincipal,
              cnpjsAdicionais: recipient.cnpjsAdicionais || [],
              aliases: recipient.aliases || [],
              cidade: recipient.cidade || '',
              uf: recipient.uf || '',
              observacoes: recipient.observacoes || '',
              ativo: recipient.ativo,
            })
          } catch (err) {
            errors.push(`${recipient.nome}: ${err instanceof Error ? err.message : 'falha ao salvar destinatário'}`)
          }
        }

        if (bulkEditContractEnabled) {
          try {
            await saveDestinatarioContract(
              recipient.cnpjPrincipal,
              bulkEditContract || ''
            )
          } catch (err) {
            errors.push(`${recipient.nome}: ${err instanceof Error ? err.message : 'falha ao salvar contrato'}`)
          }
        }
        processed += 1
      }

      reloadData()
      if (errors.length > 0) {
        const message = `${processed} destinatário(s) processado(s), mas houve falha ao salvar/sincronizar. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '; ...' : ''}`
        setBulkEditError(message)
        onNotify?.(message, 'warning')
        return
      }

      setIsBulkEditModalOpen(false)
      onNotify?.(`Alteração aplicada a ${processed} destinatário(s).`, 'success')
    } catch (err) {
      const message = `Erro ao aplicar a alteração em massa: ${err instanceof Error ? err.message : 'falha inesperada.'}`
      setBulkEditError(message)
      onNotify?.(message, 'error')
    } finally {
      setIsSavingBulkDest(false)
    }
  }

  // Filtragem dos Transbordos
  const filteredTransbordos = useMemo(() => {
    return transbordos.filter((t) => {
      if (originFilter === 'CUSTOM' && t.isSistema) return false
      if (originFilter === 'SISTEMA' && !t.isSistema) return false

      if (!searchFilter.trim()) return true
      const q = normalizeSearchText(searchFilter.trim())
      const digitsQuery = searchFilter.replace(/\D/g, '')
      const inNome = normalizeSearchText(t.nome).includes(q)
      const inCnpj = Boolean(digitsQuery) && Boolean(t.cnpj?.replace(/\D/g, '').includes(digitsQuery))
      const inAliases = (t.aliases || []).some((a) => normalizeSearchText(a).includes(q))
      const inCidade = normalizeSearchText(t.cidade || '').includes(q)
      return inNome || inCnpj || inAliases || inCidade
    })
  }, [transbordos, searchFilter, originFilter])

  const customDestCount = destinatarios.filter((d) => !d.isSistema).length
  const customTransCount = transbordos.filter((t) => !t.isSistema).length

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-blue-200/80 dark:border-blue-900/60 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
              Cadastros Logísticos (Destinatários & Transbordos)
            </h2>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Consulte a lista completa de empresas e transbordos que o sistema já identifica automaticamente nas notas fiscais,
            ou <strong>cadastre novos Destinatários e Transbordos</strong> para que notas marcadas como <em>&quot;Não Informado&quot;</em> passem a ser resolvidas instantaneamente.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeSubTab === 'transbordos' && (
            <Button
              type="button"
              size="sm"
              onClick={openNewTransModal}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs flex items-center gap-1.5 h-9 px-3.5"
            >
              <Plus className="h-4 w-4" />
              Novo Transbordo
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reloadData}
            className="text-xs h-9 px-2.5 cursor-pointer text-zinc-600 dark:text-zinc-300"
            title="Recarregar cadastros"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sub-Abas: Destinatários vs Transbordos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('destinatarios')
              setSearchFilter('')
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'destinatarios'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Destinatários & CNPJs ({destinatarios.length})</span>
            {customDestCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'destinatarios' ? 'bg-blue-500 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                +{customDestCount} novos
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('transbordos')
              setSearchFilter('')
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'transbordos'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Train className="h-4 w-4" />
            <span>Transbordos & Pátios ({transbordos.length})</span>
            {customTransCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'transbordos' ? 'bg-blue-500 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                +{customTransCount} novos
              </span>
            )}
          </button>
        </div>

        {/* Filtros de Busca e Origem */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Filtrar ${activeSubTab === 'destinatarios' ? 'destinatários' : 'transbordos'}...`}
              className="pl-8 text-xs h-8 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            />
          </div>

          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as any)}
            className="text-xs h-8 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 text-zinc-700 dark:text-zinc-300 focus:outline-hidden"
          >
            <option value="TODOS">Todos</option>
            <option value="CUSTOM">Apenas Personalizados</option>
            <option value="SISTEMA">Apenas Padrão</option>
          </select>
        </div>
      </div>

      {/* CONTEÚDO DA ABA 1: DESTINATÁRIOS */}
      {activeSubTab === 'destinatarios' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Exibindo <strong>{filteredDestinatarios.length}</strong> de <strong>{destinatarios.length}</strong> destinatário(s) cadastrado(s)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setBulkDestError('')
                  setIsBulkDestModalOpen(true)
                }}
                className="text-xs h-7 cursor-pointer"
              >
                Cadastro/edição em massa
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openBulkEditModal}
                className="text-xs h-7 cursor-pointer"
              >
                Filtrar e editar em massa
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openNewDestModal}
                className="text-xs h-7 cursor-pointer text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar Destinatário
              </Button>
            </div>
          </div>

          {filteredDestinatarios.length === 0 ? (
            <div className="p-12 text-center border border-dashed rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2">
              <Building2 className="h-10 w-10 text-zinc-400 mx-auto opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Nenhum destinatário encontrado com os filtros atuais
              </p>
              <p className="text-xs text-zinc-500">
                Clique em &quot;Cadastrar Destinatário&quot; para cadastrar uma nova empresa e seu CNPJ.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredDestinatarios.map((dest) => {
                const isCustom = !dest.isSistema
                const isCopied = copiedId === dest.id

                return (
                  <div
                    key={dest.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 shadow-2xs ${
                      isCustom
                        ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/15 dark:bg-emerald-950/10 hover:border-emerald-400'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {dest.nome}
                          </span>
                          {dest.contrato && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {dest.contrato}
                            </span>
                          )}
                          {isCustom ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              Personalizado
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              Padrão Sistema
                            </span>
                          )}
                        </div>
                        {dest.nomenclatura && (
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                            Nomenclatura destinatário: <span className="font-semibold">{dest.nomenclatura}</span>
                          </div>
                        )}
                        {dest.nomenclaturaRemetente && (
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                            Nomenclatura remetente: <span className="font-semibold">{dest.nomenclaturaRemetente}</span>
                          </div>
                        )}

                        {(dest.cidade || dest.uf) && (
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-zinc-400" />
                            <span>{[dest.cidade, dest.uf].filter(Boolean).join(' - ')}</span>
                          </div>
                        )}
                      </div>

                      {/* A edição de padrões cria um cadastro personalizado substituto. */}
                      {(isCustom || dest.isSistema) && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditDestModal(dest)}
                            className="p-1 rounded text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                            title="Editar Destinatário"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDestinatario(dest.id, dest.nome)}
                              className="p-1 rounded text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                              title="Excluir Destinatário"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CNPJ Principal */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                          CNPJ Principal:
                        </span>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {dest.cnpjPrincipal}
                        </span>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(dest.cnpjPrincipal, dest.id)}
                        className="h-6 px-2 text-[10px] text-zinc-500 cursor-pointer"
                      >
                        {isCopied ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-bold">
                            <Check className="h-3 w-3" /> Copiado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copiar
                          </span>
                        )}
                      </Button>
                    </div>

                    {/* CNPJs Adicionais / Filiais se houver */}
                    {dest.cnpjsAdicionais && dest.cnpjsAdicionais.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400">
                          Filiais / CNPJs Adicionais:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {dest.cnpjsAdicionais.map((c, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]"
                            >
                              {formatCNPJ(c)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Aliases e Palavras-Chave de Busca */}
                    {dest.aliases && dest.aliases.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          Termos Reconhecidos na Nota:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {dest.aliases.map((al, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-medium border border-blue-200 dark:border-blue-900"
                            >
                              {al}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {dest.observacoes && (
                      <p className="text-[10px] text-zinc-500 italic pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        {dest.observacoes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: TRANSBORDOS */}
      {activeSubTab === 'transbordos' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Exibindo <strong>{filteredTransbordos.length}</strong> de <strong>{transbordos.length}</strong> transbordo(s) cadastrado(s)
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewTransModal}
              className="text-xs h-7 cursor-pointer text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar Transbordo
            </Button>
          </div>

          {filteredTransbordos.length === 0 ? (
            <div className="p-12 text-center border border-dashed rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2">
              <Train className="h-10 w-10 text-zinc-400 mx-auto opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Nenhum transbordo encontrado com os filtros atuais
              </p>
              <p className="text-xs text-zinc-500">
                Clique no botão &quot;Novo Transbordo&quot; para cadastrar um novo pátio/local de transbordo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTransbordos.map((trans) => {
                const isCustom = !trans.isSistema

                return (
                  <div
                    key={trans.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 shadow-2xs ${
                      isCustom
                        ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/15 dark:bg-emerald-950/10 hover:border-emerald-400'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {trans.nome}
                          </span>
                          {trans.operadora && (
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              trans.operadora === 'RUMO'
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : trans.operadora === 'VLI'
                                ? 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300 border border-teal-300 dark:border-teal-800'
                                : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                            }`}>
                              {trans.operadora}
                            </span>
                          )}
                          {isCustom ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              Personalizado
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              Padrão Sistema
                            </span>
                          )}
                        </div>

                        {(trans.cidade || trans.uf) && (
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-zinc-400" />
                            <span>{[trans.cidade, trans.uf].filter(Boolean).join(' - ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação para Itens Personalizados */}
                      {isCustom && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditTransModal(trans)}
                            className="p-1 rounded text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                            title="Editar Transbordo"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransbordo(trans.id, trans.nome)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Excluir Transbordo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* CNPJ se houver */}
                    {trans.cnpj && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                            CNPJ do Armazém / Transbordo:
                          </span>
                          <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {trans.cnpj}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(trans.cnpj!, trans.id)}
                          className="h-6 px-2 text-[10px] text-zinc-500 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Aliases e Palavras-Chave de Busca */}
                    {trans.aliases && trans.aliases.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          Termos Buscados nas Notas (InfCpl / Dados Adicionais):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {trans.aliases.map((al, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-medium border border-amber-200 dark:border-amber-900"
                            >
                              {al}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {trans.observacoes && (
                      <p className="text-[10px] text-zinc-500 italic pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        {trans.observacoes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CADASTRO / EDIÇÃO DE DESTINATÁRIO */}
      <Dialog open={isDestModalOpen} onOpenChange={setIsDestModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              {editingDest ? `Editar ${editingDest.nome}` : 'Cadastrar Novo Destinatário'}
              {destContrato && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {destContrato}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              O nome cadastrado será exibido quando o CNPJ principal, uma filial ou a raiz do CNPJ forem encontrados na nota.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDestinatario} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Razão Social / Nome de Exibição <span className="text-rose-500">*</span>
              </label>
              <Input
                value={destNome}
                onChange={(e) => setDestNome(e.target.value)}
                placeholder="Ex: SUCRES ET DENREES BRASIL S.A."
                required
                className="text-xs uppercase"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Nomenclatura do destinatário (opcional)
              </label>
              <Input
                value={destNomenclatura}
                onChange={(e) => setDestNomenclatura(e.target.value)}
                placeholder="Nomenclatura associada ao destinatário"
                className="text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Nomenclatura do remetente (opcional)
              </label>
              <Input
                value={destNomenclaturaRemetente}
                onChange={(e) => setDestNomenclaturaRemetente(e.target.value)}
                placeholder="Nomenclatura associada ao remetente"
                className="text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Contrato (opcional)
              </label>
              <select
                value={destContrato}
                onChange={(e) => setDestContrato(e.target.value as ContratoDestinatario | '')}
                className="w-full text-xs h-9 rounded-md border border-input bg-background px-3 py-1 text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sem contrato</option>
                {CONTRATOS_DESTINATARIO.map((contrato) => (
                  <option key={contrato} value={contrato}>{contrato}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                CNPJ Principal (14 dígitos) <span className="text-rose-500">*</span>
              </label>
              <Input
                value={destCnpj}
                onChange={(e) => setDestCnpj(e.target.value)}
                placeholder="Ex: 00.000.000/0001-00"
                required
                disabled={editingDest?.isSistema}
                className="text-xs font-mono"
              />
              <span className="text-[10px] text-zinc-400">
                {editingDest?.isSistema
                  ? 'O CNPJ padrão fica protegido; a personalização altera o nome exibido.'
                  : 'Pode digitar com ou sem pontos/barras.'}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                CNPJs Adicionais / Filiais ou Raiz (opcional)
              </label>
              <Input
                value={destCnpjsAdicionais}
                onChange={(e) => setDestCnpjsAdicionais(e.target.value)}
                placeholder="Filiais ou raiz com 8 dígitos, separados por vírgula"
                disabled={editingDest?.isSistema}
                className="text-xs font-mono"
              />
              <span className="text-[10px] text-zinc-400">
                Exemplo: 48.708.267 corresponde a qualquer filial com essa raiz.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Termos / Aliases de Busca nas Notas (opcional)
              </label>
              <Input
                value={destAliases}
                onChange={(e) => setDestAliases(e.target.value)}
                placeholder="Ex: SUCDEN, SUCRES, DENREES (separados por vírgula)"
                className="text-xs"
              />
              <span className="text-[10px] text-zinc-400">
                Palavras-chave que podem aparecer no campo de informações complementares quando o nome oficial estiver cortado.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Cidade (opcional)
                </label>
                <Input
                  value={destCidade}
                  onChange={(e) => setDestCidade(e.target.value)}
                  placeholder="Ex: Santos"
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  UF
                </label>
                <Input
                  value={destUf}
                  onChange={(e) => setDestUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                  className="text-xs uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Observações Operacionais (opcional)
              </label>
              <Input
                value={destObservacoes}
                onChange={(e) => setDestObservacoes(e.target.value)}
                placeholder="Ex: Cliente com entrega prioritária no armazém"
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDestModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                {editingDest ? 'Salvar Alterações' : 'Cadastrar Destinatário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkEditModalOpen} onOpenChange={setIsBulkEditModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Filtrar e editar destinatários em massa</DialogTitle>
            <DialogDescription className="text-xs">
              Filtre por nome, nomenclaturas, CNPJ ou alias; selecione os destinatários e marque quais campos deseja aplicar igualmente a todos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                value={bulkEditFilter}
                onChange={(event) => setBulkEditFilter(event.target.value)}
                placeholder="Filtrar por nome, nomenclaturas, CNPJ ou alias..."
                className="h-9 pl-8 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span>
                {bulkEditFilteredDestinatarios.length} resultado(s); {bulkEditSelectedIds.length} selecionado(s)
              </span>
              <button
                type="button"
                onClick={() => {
                  const visibleIds = bulkEditFilteredDestinatarios.map((recipient) => recipient.id)
                  const allVisibleSelected = visibleIds.every((id) => bulkEditSelectedIds.includes(id))
                  setBulkEditSelectedIds((current) => allVisibleSelected
                    ? current.filter((id) => !visibleIds.includes(id))
                    : Array.from(new Set([...current, ...visibleIds]))
                  )
                }}
                className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                {bulkEditFilteredDestinatarios.length > 0 &&
                  bulkEditFilteredDestinatarios.every((recipient) => bulkEditSelectedIds.includes(recipient.id))
                  ? 'Desmarcar resultados'
                  : 'Selecionar todos os resultados'}
              </button>
            </div>

            <div className="max-h-56 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              {bulkEditFilteredDestinatarios.length === 0 ? (
                <div className="p-5 text-center text-xs text-zinc-500">Nenhum destinatário encontrado.</div>
              ) : (
                bulkEditFilteredDestinatarios.map((recipient) => (
                  <label
                    key={recipient.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={bulkEditSelectedIds.includes(recipient.id)}
                      onChange={(event) => setBulkEditSelectedIds((current) => event.target.checked
                        ? [...current, recipient.id]
                        : current.filter((id) => id !== recipient.id)
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">{recipient.nome}</span>
                    <span className="text-zinc-500">{recipient.cnpjPrincipal}</span>
                    {recipient.nomenclatura && <span className="text-zinc-500">Dest.: {recipient.nomenclatura}</span>}
                    {recipient.nomenclaturaRemetente && <span className="text-zinc-500">Rem.: {recipient.nomenclaturaRemetente}</span>}
                    {recipient.contrato && <span className="font-semibold text-indigo-600 dark:text-indigo-400">{recipient.contrato}</span>}
                  </label>
                ))
              )}
            </div>

            <div className="grid gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 md:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-2 text-xs">
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={bulkEditNameEnabled}
                    onChange={(event) => setBulkEditNameEnabled(event.target.checked)}
                  />
                  Aplicar mesmo nome a todos
                </span>
                <Input
                  value={bulkEditName}
                  onChange={(event) => setBulkEditName(event.target.value)}
                  disabled={!bulkEditNameEnabled}
                  placeholder="Novo nome do destinatário"
                  className="h-8 text-xs"
                />
              </label>

              <label className="space-y-2 text-xs">
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={bulkEditSenderNomenclatureEnabled}
                    onChange={(event) => setBulkEditSenderNomenclatureEnabled(event.target.checked)}
                  />
                  Aplicar mesma nomenclatura do remetente
                </span>
                <Input
                  value={bulkEditSenderNomenclature}
                  onChange={(event) => setBulkEditSenderNomenclature(event.target.value)}
                  disabled={!bulkEditSenderNomenclatureEnabled}
                  placeholder="Nomenclatura do remetente (vazio remove)"
                  className="h-8 text-xs"
                />
              </label>

              <label className="space-y-2 text-xs">
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={bulkEditNomenclatureEnabled}
                    onChange={(event) => setBulkEditNomenclatureEnabled(event.target.checked)}
                  />
                  Aplicar mesma nomenclatura
                </span>
                <Input
                  value={bulkEditNomenclature}
                  onChange={(event) => setBulkEditNomenclature(event.target.value)}
                  disabled={!bulkEditNomenclatureEnabled}
                  placeholder="Nomenclatura (vazio remove)"
                  className="h-8 text-xs"
                />
              </label>

              <label className="space-y-2 text-xs">
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={bulkEditContractEnabled}
                    onChange={(event) => setBulkEditContractEnabled(event.target.checked)}
                  />
                  Aplicar mesmo contrato
                </span>
                <select
                  value={bulkEditContract}
                  onChange={(event) => setBulkEditContract(event.target.value as ContratoDestinatario | '')}
                  disabled={!bulkEditContractEnabled}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Sem contrato (limpar)</option>
                  {CONTRATOS_DESTINATARIO.map((contract) => (
                    <option key={contract} value={contract}>{contract}</option>
                  ))}
                </select>
              </label>
            </div>

            {bulkEditError && (
              <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {bulkEditError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBulkEditModalOpen(false)}
              disabled={isSavingBulkDest}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleBulkEditDestinatarios}
              disabled={isSavingBulkDest}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSavingBulkDest ? 'Aplicando...' : `Aplicar aos ${bulkEditSelectedIds.length} selecionado(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cadastro em massa também atualiza destinatários existentes pelo CNPJ. */}
      <Dialog open={isBulkDestModalOpen} onOpenChange={setIsBulkDestModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Cadastro/edição em massa de destinatários</DialogTitle>
            <DialogDescription className="text-xs">
              Preencha as colunas abaixo ou cole as cinco colunas copiadas de uma planilha na primeira célula.
              Destinatário e CNPJ/CPF são obrigatórios; nomenclaturas e contrato podem ficar vazios.
              CNPJs já cadastrados serão atualizados, preservando os demais campos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-[55vh] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                  <tr className="text-left">
                    <th className="p-2 font-semibold">Destinatário *</th>
                    <th className="p-2 font-semibold">CNPJ/CPF *</th>
                    <th className="p-2 font-semibold">Nomenclatura destinatário</th>
                    <th className="p-2 font-semibold">Nomenclatura remetente</th>
                    <th className="p-2 font-semibold">Contrato</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkDestRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-zinc-200 dark:border-zinc-800">
                      {(['nome', 'cnpj', 'nomenclatura', 'nomenclaturaRemetente', 'contrato'] as const).map((column, columnIndex) => (
                        <td key={column} className="p-1.5">
                          <Input
                            value={row[column]}
                            onChange={(event) => updateBulkDestCell(rowIndex, column, event.target.value)}
                            onPaste={(event) => handleBulkDestPaste(event, rowIndex, columnIndex)}
                            placeholder={
                              column === 'nome' ? 'Nome do destinatário' :
                              column === 'cnpj' ? '00.000.000/0001-00' :
                              column === 'nomenclatura' ? 'Nomenclatura destinatário' :
                              column === 'nomenclaturaRemetente' ? 'Nomenclatura remetente' :
                              'Ex.: CGL-T'
                            }
                            className={`h-8 text-xs ${column === 'cnpj' ? 'font-mono' : ''}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bulkDestError && (
              <div
                role="alert"
                className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
              >
                {bulkDestError}
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setBulkDestRows((rows) => [
                ...rows,
                { nome: '', cnpj: '', nomenclatura: '', nomenclaturaRemetente: '', contrato: '', line: 0 },
              ])}
              className="text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar linha
            </Button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBulkDestModalOpen(false)}
              disabled={isSavingBulkDest}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleBulkSaveDestinatarios}
              disabled={isSavingBulkDest}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSavingBulkDest ? 'Salvando...' : 'Validar e salvar lista'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CADASTRO / EDIÇÃO DE TRANSBORDO */}
      <Dialog open={isTransModalOpen} onOpenChange={setIsTransModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Train className="h-5 w-5 text-blue-600" />
              {editingTrans ? 'Editar Transbordo' : 'Cadastrar Novo Transbordo'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre o nome do pátio, pátio rodoferroviário ou armazém de transbordo para identificação automática em dados adicionais e relatórios.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTransbordo} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Nome do Transbordo / Pátio <span className="text-rose-500">*</span>
              </label>
              <Input
                value={transNome}
                onChange={(e) => setTransNome(e.target.value)}
                placeholder="Ex: NOVO TERMINAL ARMAZENAGEM"
                required
                className="text-xs uppercase font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  CNPJ do Armazém / Transbordo (opcional)
                </label>
                <Input
                  value={transCnpj}
                  onChange={(e) => setTransCnpj(e.target.value)}
                  placeholder="Ex: 00.000.000/0001-00"
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Operadora
                </label>
                <select
                  value={transOperadora}
                  onChange={(e) => setTransOperadora(e.target.value)}
                  className="w-full text-xs h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 text-zinc-700 dark:text-zinc-300 focus:outline-hidden"
                >
                  <option value="RUMO">Rumo Logística</option>
                  <option value="VLI">VLI Multimodal</option>
                  <option value="OUTRA">Outra / Rodoviária</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Cidade (opcional)
                </label>
                <Input
                  value={transCidade}
                  onChange={(e) => setTransCidade(e.target.value)}
                  placeholder="Ex: Paulínia"
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  UF
                </label>
                <Input
                  value={transUf}
                  onChange={(e) => setTransUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                  className="text-xs uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Termos / Aliases de Busca no Texto da Nota
              </label>
              <Input
                value={transAliases}
                onChange={(e) => setTransAliases(e.target.value)}
                placeholder="Ex: PATIO PAULINIA, TRANSBORDO PAULINIA (separados por vírgula)"
                className="text-xs"
              />
              <span className="text-[10px] text-zinc-400">
                Se algum destes termos aparecer no campo &quot;Informações Complementares&quot;, o transbordo será preenchido automaticamente.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Observações (opcional)
              </label>
              <Input
                value={transObservacoes}
                onChange={(e) => setTransObservacoes(e.target.value)}
                placeholder="Ex: Transbordo com balança integrada"
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTransModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                {editingTrans ? 'Salvar Alterações' : 'Cadastrar Transbordo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
