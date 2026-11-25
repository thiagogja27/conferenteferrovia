import { useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConferenceSummary,
  ConferenceSummaryFormat,
  SummaryGroup,
  createConferenceSummary,
  getConferenceProducts,
} from '@/lib/conference-summary'

const formatNumber = new Intl.NumberFormat('pt-BR')
const ALL_PRODUCTS = '__all_products__'

function SummaryTable({
  title,
  description,
  rows,
  countHeading,
  weightHeading,
}: {
  title: string
  description: string
  rows: SummaryGroup[]
  countHeading?: string
  weightHeading?: string
}) {
  const totalCount = rows.reduce((total, row) => total + (row.count ?? 0), 0)
  const totalWeight = rows.reduce((total, row) => total + (row.weight ?? 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Produto</th>
                  <th className="px-3 py-2 font-semibold">Agrupamento</th>
                  {countHeading && <th className="px-3 py-2 text-right font-semibold">{countHeading}</th>}
                  {weightHeading && <th className="px-3 py-2 text-right font-semibold">{weightHeading}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((row) => (
                  <tr key={`${row.product}-${row.name}`} className="text-zinc-700 dark:text-zinc-300">
                    <td className="px-3 py-2">{row.product}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    {countHeading && <td className="px-3 py-2 text-right">{formatNumber.format(row.count ?? 0)}</td>}
                    {weightHeading && <td className="px-3 py-2 text-right">{formatNumber.format(row.weight ?? 0)}</td>}
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-bold text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  {countHeading && <td className="px-3 py-2 text-right">{formatNumber.format(totalCount)}</td>}
                  {weightHeading && <td className="px-3 py-2 text-right">{formatNumber.format(totalWeight)}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
            Nenhum registro para este agrupamento.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function exportSummary(summary: ConferenceSummary, format: ConferenceSummaryFormat): void {
  const workbook = XLSX.utils.book_new()
  const addSummarySheet = (
    name: string,
    rows: SummaryGroup[],
    columns: Array<{ key: 'count' | 'weight'; title: string }>
  ) => {
    const sheetRows = [
      ['Produto', 'Agrupamento', ...columns.map((column) => column.title)],
      ...rows.map((row) => [row.product, row.name, ...columns.map((column) => row[column.key] ?? 0)]),
      [
        'Total',
        '',
        ...columns.map((column) =>
          rows.reduce((total, row) => total + (row[column.key] ?? 0), 0)
        ),
      ],
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
    worksheet['!cols'] = [{ wch: 28 }, { wch: 36 }, ...columns.map(() => ({ wch: 22 }))]
    XLSX.utils.book_append_sheet(workbook, worksheet, name)
  }

  addSummarySheet('Vagoes transportador', summary.wagonsByTransporter, [
    { key: 'count', title: 'Quantidade de vagões' },
  ])

  const wagonDetailsWorksheet = XLSX.utils.aoa_to_sheet([
    [
      'Número Pesagem',
      'Placa',
      'Transportador',
      'Dono Mercadoria',
      'Produto',
      'Peso Recebido Positivo',
    ],
    ...summary.wagonsDetail.map((row) => [
      row.weighingNumber,
      row.plate,
      row.transporter,
      row.goodsOwner,
      row.product,
      row.receivedWeight,
    ]),
  ])
  wagonDetailsWorksheet['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 38 },
    { wch: 28 },
    { wch: 28 },
    { wch: 24 },
  ]
  XLSX.utils.book_append_sheet(workbook, wagonDetailsWorksheet, 'Vagões detalhados')

  const transporterOwnerWorksheet = XLSX.utils.aoa_to_sheet([
    ['Produto', 'Transportador', 'Dono Mercadoria', 'Quantidade de Vagões', 'Peso Recebido Positivo'],
    ...summary.wagonsByTransporterOwner.map((row) => [
      row.product,
      row.transporter,
      row.goodsOwner,
      row.count,
      row.receivedWeight,
    ]),
  ])
  transporterOwnerWorksheet['!cols'] = [
    { wch: 28 },
    { wch: 38 },
    { wch: 28 },
    { wch: 22 },
    { wch: 24 },
  ]
  XLSX.utils.book_append_sheet(workbook, transporterOwnerWorksheet, 'Vagões por dono')

  addSummarySheet('Peso vagões por dono', summary.wagonWeightByOwner, [
    { key: 'weight', title: 'Peso recebido positivo' },
  ])
  addSummarySheet('Caminhoes por dono', summary.trucksByOwner, [
    { key: 'count', title: 'Quantidade de caminhões' },
    { key: 'weight', title: 'Peso recebido positivo' },
  ])
  addSummarySheet('Peso por armazenagem', summary.weightByStorage, [
    { key: 'weight', title: 'Peso recebido positivo' },
  ])

  const negativeWorksheet = XLSX.utils.aoa_to_sheet([
    [
      'Número Pesagem',
      'Placa',
      'Tipo Veículo',
      'Transportador',
      'Dono Mercadoria',
      'Local Armazenagem',
      'Produto',
      'Peso Recebido',
    ],
    ...summary.negativeRows.map((row) => [
      row.weighingNumber,
      row.plate,
      row.vehicleType,
      row.transporter,
      row.goodsOwner,
      row.storageLocation,
      row.product,
      row.receivedWeight,
    ]),
  ])
  negativeWorksheet['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 28 },
    { wch: 38 },
    { wch: 28 },
    { wch: 24 },
    { wch: 28 },
    { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(workbook, negativeWorksheet, 'Pesos negativos')

  const filePrefix = format === 'corporate' ? 'resumo_corporate' : 'resumo_conferencia'
  XLSX.writeFile(workbook, `${filePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function ConferenceSummaryTool({
  format = 'weighing',
}: {
  format?: ConferenceSummaryFormat
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sheetRows, setSheetRows] = useState<unknown[][] | null>(null)
  const [products, setProducts] = useState<string[]>([])
  const [selectedProduct, setSelectedProduct] = useState(ALL_PRODUCTS)
  const [fileName, setFileName] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showWagonDetails, setShowWagonDetails] = useState(false)
  const summary = useMemo(
    () => sheetRows
      ? createConferenceSummary(
        sheetRows,
        format,
        selectedProduct === ALL_PRODUCTS ? undefined : selectedProduct
      )
      : null,
    [sheetRows, format, selectedProduct]
  )

  const handleFile = async (file?: File) => {
    if (!file) return

    setIsLoading(true)
    setNotice('')
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      let result: ConferenceSummary | undefined
      let parsedRows: unknown[][] | undefined
      let lastError: unknown
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        if (!worksheet) continue
        try {
          const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            raw: true,
            defval: '',
            blankrows: false,
          })
          result = createConferenceSummary(sheetRows, format)
          parsedRows = sheetRows
          break
        } catch (error) {
          lastError = error
        }
      }
      if (!result) {
        if (lastError instanceof Error) throw lastError
        throw new Error('A planilha não contém nenhuma aba com dados.')
      }
      if (!parsedRows) throw new Error('Não foi possível ler os dados da planilha.')
      setSheetRows(parsedRows)
      setProducts(getConferenceProducts(parsedRows, format))
      setSelectedProduct(ALL_PRODUCTS)
      setFileName(file.name)
      setNotice(`Resumo calculado com ${formatNumber.format(result.rows.length)} registro(s).`)
    } catch (error) {
      console.error('Não foi possível gerar o resumo da planilha:', error)
      setSheetRows(null)
      setProducts([])
      setFileName('')
      setNotice(error instanceof Error ? error.message : 'Não foi possível ler a planilha selecionada.')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleExport = () => {
    if (!summary) return
    try {
      exportSummary(summary, format)
      setNotice('Resumo exportado para Excel.')
    } catch (error) {
      console.error('Não foi possível exportar o resumo:', error)
      setNotice('Não foi possível exportar o arquivo Excel.')
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-950/40 dark:to-zinc-950">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{format === 'corporate' ? 'Resumo Corporate' : 'Resumo da planilha de pesagem'}</CardTitle>
              <CardDescription className="mt-2">
                {format === 'corporate'
                  ? 'Usa Contrato como dono da mercadoria, Depósito como local de armazenagem e Peso Líquido como peso recebido.'
                  : 'Usa Dono Mercadoria, Local Armazenagem e Peso Recebido da planilha de pesagem.'}
                {' '}Filtre por produto para ver os totais de vagões, caminhões e peso positivo por local.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
            <Upload className="h-4 w-4" />
            {isLoading ? 'Lendo planilha...' : 'Selecionar planilha'}
          </Button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {fileName || (format === 'corporate'
              ? 'Planilha Corporate: Contrato, Depósito, Peso Líquido e Produto'
              : 'Planilha de pesagem: Dono Mercadoria, Local Armazenagem, Peso Recebido e Produto')}
          </span>
          {products.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              Produto
              <select
                value={selectedProduct}
                onChange={(event) => setSelectedProduct(event.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <option value={ALL_PRODUCTS}>Todos os produtos</option>
                {products.map((product) => <option key={product} value={product}>{product}</option>)}
              </select>
            </label>
          )}
          {summary && (
            <Button variant="outline" className="ml-auto" onClick={handleExport}>
              <Download className="h-4 w-4" /> Exportar resumo Excel
            </Button>
          )}
          {notice && <p role="status" className="w-full text-sm text-zinc-600 dark:text-zinc-300">{notice}</p>}
        </CardContent>
      </Card>

      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Registros', value: summary.rows.length },
              { label: 'Vagões', value: summary.wagonCount },
              { label: 'Caminhões', value: summary.truckCount },
              { label: 'Veículos com peso negativo', value: summary.negativeVehicleCount },
              { label: 'Peso recebido positivo', value: formatNumber.format(summary.totalReceivedWeight) },
            ].map((metric) => (
              <Card key={metric.label}>
                <CardContent className="flex items-center justify-between gap-2 p-4">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">{metric.label}</span>
                  <strong className="text-lg text-zinc-900 dark:text-zinc-100">{metric.value}</strong>
                </CardContent>
              </Card>
            ))}
          </div>

          <SummaryTable
            title="Vagões por transportador"
            description="Quantidade de vagões distintos, identificados pelo número de pesagem."
            rows={summary.wagonsByTransporter}
            countHeading="Quantidade de vagões"
          />
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Total de vagões por transportador e dono da mercadoria</CardTitle>
                  <CardDescription className="mt-1">
                    Soma a quantidade de vagões e o peso recebido positivo por cada combinação.
                  </CardDescription>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={showWagonDetails}
                    onChange={(event) => setShowWagonDetails(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600"
                  />
                  Detalhar por placa
                </label>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Produto</th>
                      <th className="px-3 py-2 font-semibold">Transportador</th>
                      <th className="px-3 py-2 font-semibold">Dono Mercadoria</th>
                      <th className="px-3 py-2 text-right font-semibold">Quantidade de Vagões</th>
                      <th className="px-3 py-2 text-right font-semibold">Peso Recebido Positivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {summary.wagonsByTransporterOwner.map((row) => (
                      <tr
                        key={`${row.product}-${row.transporter}-${row.goodsOwner}`}
                        className="text-zinc-700 dark:text-zinc-300"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">{row.product}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.transporter}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.goodsOwner}</td>
                        <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{row.count}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatNumber.format(row.receivedWeight)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showWagonDetails && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    Detalhamento por placa
                  </h4>
                  {summary.wagonsDetail.length ? (
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Número Pesagem</th>
                            <th className="px-3 py-2 font-semibold">Placa</th>
                            <th className="px-3 py-2 font-semibold">Produto</th>
                            <th className="px-3 py-2 font-semibold">Transportador</th>
                            <th className="px-3 py-2 font-semibold">Dono Mercadoria</th>
                            <th className="px-3 py-2 text-right font-semibold">Peso Recebido Positivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {summary.wagonsDetail.map((row) => (
                            <tr
                              key={`${row.weighingNumber}-${row.plate}-${row.transporter}-${row.goodsOwner}`}
                              className="text-zinc-700 dark:text-zinc-300"
                            >
                              <td className="px-3 py-2 whitespace-nowrap">{row.weighingNumber || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.plate || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.product}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.transporter}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.goodsOwner}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {formatNumber.format(row.receivedWeight)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
                      Nenhum vagão encontrado na planilha.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <SummaryTable
            title="Peso recebido de vagões por dono da mercadoria"
            description="Soma do Peso Recebido dos vagões; valores negativos são desconsiderados."
            rows={summary.wagonWeightByOwner}
            weightHeading="Peso recebido"
          />
          <SummaryTable
            title="Caminhões por dono da mercadoria"
            description="Quantidade de caminhões distintos e peso recebido positivo."
            rows={summary.trucksByOwner}
            countHeading="Quantidade de caminhões"
            weightHeading="Peso recebido"
          />
          <SummaryTable
            title="Peso recebido por local de armazenagem"
            description="Soma do Peso Recebido de todos os veículos; valores negativos são desconsiderados."
            rows={summary.weightByStorage}
            weightHeading="Peso recebido"
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Veículos com peso recebido negativo</CardTitle>
              <CardDescription>
                Lista separada dos registros com Peso Recebido negativo. Estes veículos não entram nas somas positivas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.negativeRows.length ? (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Número Pesagem</th>
                        <th className="px-3 py-2 font-semibold">Placa</th>
                        <th className="px-3 py-2 font-semibold">Tipo</th>
                        <th className="px-3 py-2 font-semibold">Transportador</th>
                        <th className="px-3 py-2 font-semibold">Dono Mercadoria</th>
                        <th className="px-3 py-2 font-semibold">Local Armazenagem</th>
                        <th className="px-3 py-2 font-semibold">Produto</th>
                        <th className="px-3 py-2 text-right font-semibold">Peso Recebido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {summary.negativeRows.map((row) => (
                        <tr key={`negative-${row.sourceRow}`} className="text-zinc-700 dark:text-zinc-300">
                          <td className="px-3 py-2 whitespace-nowrap">{row.weighingNumber || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.plate || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.vehicleType}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.transporter}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.goodsOwner}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.storageLocation}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.product}</td>
                          <td className="px-3 py-2 text-right font-bold text-red-700 dark:text-red-300 whitespace-nowrap">
                            {formatNumber.format(row.receivedWeight)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
                  Nenhum veículo com Peso Recebido negativo.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
