export interface ConferenceSummaryRow {
  weighingNumber: string
  plate: string
  transporter: string
  vehicleType: string
  goodsOwner: string
  storageLocation: string
  product: string
  receivedWeight: number
  isWagon: boolean
  sourceRow: number
}

export type ConferenceSummaryFormat = 'weighing' | 'corporate'

export interface SummaryGroup {
  name: string
  product: string
  count?: number
  weight?: number
}

export interface WagonDetail {
  weighingNumber: string
  plate: string
  transporter: string
  goodsOwner: string
  product: string
  receivedWeight: number
}

export interface WagonTransporterOwnerGroup {
  transporter: string
  goodsOwner: string
  product: string
  count: number
  receivedWeight: number
}

export interface ConferenceSummary {
  rows: ConferenceSummaryRow[]
  negativeRows: ConferenceSummaryRow[]
  wagonsDetail: WagonDetail[]
  wagonsByTransporterOwner: WagonTransporterOwnerGroup[]
  wagonsByTransporter: SummaryGroup[]
  wagonWeightByOwner: SummaryGroup[]
  trucksByOwner: SummaryGroup[]
  weightByStorage: SummaryGroup[]
  wagonCount: number
  truckCount: number
  negativeVehicleCount: number
  totalReceivedWeight: number
}

type ColumnKey =
  | 'weighingNumber'
  | 'transporter'
  | 'vehicleType'
  | 'plate'
  | 'goodsOwner'
  | 'storageLocation'
  | 'receivedWeight'
  | 'product'

const COLUMN_HEADERS: Record<ConferenceSummaryFormat, Record<ColumnKey, string>> = {
  weighing: {
    weighingNumber: 'numeropesagem',
    transporter: 'transportador',
    vehicleType: 'tipoveiculo',
    plate: 'placa',
    goodsOwner: 'donomercadoria',
    storageLocation: 'localarmazenagem',
    receivedWeight: 'pesorecebido',
    product: 'produto',
  },
  corporate: {
    weighingNumber: 'ficha',
    transporter: 'transportadora',
    vehicleType: 'modal',
    plate: 'placa',
    goodsOwner: 'contrato',
    storageLocation: 'deposito',
    receivedWeight: 'pesoliquido',
    product: 'produto',
  },
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  weighingNumber: 'Número Pesagem / Ficha',
  transporter: 'Transportador / Transportadora',
  vehicleType: 'Tipo Veículo / Modal',
  plate: 'Placa',
  goodsOwner: 'Dono Mercadoria / Contrato',
  storageLocation: 'Local Armazenagem / Depósito',
  receivedWeight: 'Peso Recebido / Peso Líquido',
  product: 'Produto',
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function getColumnIndexes(header: unknown[], format: ConferenceSummaryFormat): Record<ColumnKey, number> {
  const indexes = {} as Record<ColumnKey, number>
  const normalizedHeaders = header.map(normalizeHeader)
  const requiredHeaders = COLUMN_HEADERS[format]

  for (const [column, requiredHeader] of Object.entries(requiredHeaders) as Array<[ColumnKey, string]>) {
    const index = normalizedHeaders.indexOf(requiredHeader)
    if (index < 0) {
      throw new Error(`Coluna obrigatória não encontrada: ${COLUMN_LABELS[column]}.`)
    }
    indexes[column] = index
  }

  return indexes
}

function findHeader(
  sheetRows: unknown[][],
  format: ConferenceSummaryFormat
): { headerRowIndex: number; header: unknown[] } {
  const requiredHeaders = Object.values(COLUMN_HEADERS[format])
  const headerCandidate = sheetRows
    .map((row, index) => ({
      row,
      index,
      matches: requiredHeaders.filter((requiredHeader) =>
        row.some((cell) => normalizeHeader(cell) === requiredHeader)
      ),
    }))
    .reduce(
      (best, candidate) => candidate.matches.length > best.matches.length ? candidate : best,
      { row: [], index: -1, matches: [] as string[] }
    )

  if (headerCandidate.matches.length !== requiredHeaders.length) {
    const normalizedHeaders = headerCandidate.row.map(normalizeHeader)
    const missingLabels = (Object.entries(COLUMN_HEADERS[format]) as Array<[ColumnKey, string]>)
      .filter(([, header]) => !normalizedHeaders.includes(header))
      .map(([column]) => COLUMN_LABELS[column])
    throw new Error(`Colunas obrigatórias não encontradas: ${missingLabels.join(', ')}.`)
  }

  return { headerRowIndex: headerCandidate.index, header: headerCandidate.row }
}

function parseWeight(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return 0

  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/\.(?=\d{3}(?:\D|$))/g, '')
  const weight = Number(normalized)
  return Number.isFinite(weight) ? weight : 0
}

function text(value: unknown): string {
  return String(value ?? '').trim() || 'Não informado'
}

function groupBy<T>(
  rows: T[],
  getName: (row: T) => string,
  getProduct: (row: T) => string,
  getKey: (row: T) => string,
  getWeight: (row: T) => number
): SummaryGroup[] {
  const groups = new Map<string, { name: string; product: string; keys: Set<string>; weight: number }>()

  for (const row of rows) {
    const name = getName(row)
    const product = getProduct(row)
    const groupKey = `${product}|${name}`
    const group = groups.get(groupKey) ?? { name, product, keys: new Set<string>(), weight: 0 }
    group.keys.add(getKey(row))
    group.weight += getWeight(row)
    groups.set(groupKey, group)
  }

  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      product: group.product,
      count: group.keys.size,
      weight: group.weight,
    }))
    .sort((a, b) => `${a.product}|${a.name}`.localeCompare(`${b.product}|${b.name}`, 'pt-BR'))
}

export function getConferenceProducts(
  sheetRows: unknown[][],
  format: ConferenceSummaryFormat
): string[] {
  const { headerRowIndex, header } = findHeader(sheetRows, format)
  const indexes = getColumnIndexes(header, format)
  return [...new Set(
    sheetRows.slice(headerRowIndex + 1)
      .filter((row) =>
        String(row[indexes.weighingNumber] ?? '').trim() ||
        String(row[indexes.plate] ?? '').trim() ||
        parseWeight(row[indexes.receivedWeight]) !== 0
      )
      .map((row) => text(row[indexes.product]))
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function createConferenceSummary(
  sheetRows: unknown[][],
  format: ConferenceSummaryFormat = 'weighing',
  productFilter?: string
): ConferenceSummary {
  const { headerRowIndex, header } = findHeader(sheetRows, format)
  const indexes = getColumnIndexes(header, format)
  const rows = sheetRows.slice(headerRowIndex + 1)
    .map((row, index): ConferenceSummaryRow => {
      const vehicleType = text(row[indexes.vehicleType])
      const normalizedVehicleType = normalizeHeader(vehicleType)

      return {
        weighingNumber: String(row[indexes.weighingNumber] ?? '').trim(),
        plate: String(row[indexes.plate] ?? '').trim(),
        transporter: text(row[indexes.transporter]),
        vehicleType,
        goodsOwner: text(row[indexes.goodsOwner]),
        storageLocation: text(row[indexes.storageLocation]),
        product: text(row[indexes.product]),
        receivedWeight: parseWeight(row[indexes.receivedWeight]),
        isWagon:
          normalizedVehicleType.includes('vagao') ||
          normalizedVehicleType.includes('ferrovi') ||
          normalizedVehicleType.includes('rail'),
        sourceRow: headerRowIndex + index + 2,
      }
    })
    .filter((row) =>
      (row.weighingNumber || row.plate || row.receivedWeight !== 0) &&
      (!productFilter || row.product === productFilter)
    )

  const wagons = rows.filter((row) => row.isWagon)
  const trucks = rows.filter((row) => !row.isWagon)
  const positiveWeight = (row: ConferenceSummaryRow) => Math.max(0, row.receivedWeight)
  const vehicleKey = (row: ConferenceSummaryRow) =>
    row.weighingNumber || row.plate || `linha-${row.sourceRow}`
  const negativeRows = rows.filter((row) => row.receivedWeight < 0)
  const wagonDetailsMap = new Map<string, WagonDetail>()

  for (const row of wagons) {
    const key = `${row.weighingNumber || row.plate || `linha-${row.sourceRow}`}|${row.goodsOwner}|${row.transporter}|${row.product}`
    const existing = wagonDetailsMap.get(key)
    if (existing) {
      existing.receivedWeight += Math.max(0, row.receivedWeight)
      if (!existing.plate && row.plate) existing.plate = row.plate
    } else {
      wagonDetailsMap.set(key, {
        weighingNumber: row.weighingNumber,
        plate: row.plate,
        transporter: row.transporter,
        goodsOwner: row.goodsOwner,
        product: row.product,
        receivedWeight: Math.max(0, row.receivedWeight),
      })
    }
  }
  const wagonsDetail = [...wagonDetailsMap.values()].sort((a, b) =>
    `${a.transporter}|${a.weighingNumber}`.localeCompare(
      `${b.transporter}|${b.weighingNumber}`,
      'pt-BR'
    )
  )
  const wagonTransporterOwnerMap = new Map<string, WagonTransporterOwnerGroup>()

  for (const wagon of wagonsDetail) {
    const key = `${wagon.product}|${wagon.transporter}|${wagon.goodsOwner}`
    const existing = wagonTransporterOwnerMap.get(key)
    if (existing) {
      existing.count += 1
      existing.receivedWeight += wagon.receivedWeight
    } else {
      wagonTransporterOwnerMap.set(key, {
        transporter: wagon.transporter,
        goodsOwner: wagon.goodsOwner,
        product: wagon.product,
        count: 1,
        receivedWeight: wagon.receivedWeight,
      })
    }
  }
  const wagonsByTransporterOwner = [...wagonTransporterOwnerMap.values()].sort((a, b) =>
    `${a.product}|${a.transporter}|${a.goodsOwner}`.localeCompare(
      `${b.product}|${b.transporter}|${b.goodsOwner}`,
      'pt-BR'
    )
  )

  return {
    rows,
    negativeRows,
    wagonsDetail,
    wagonsByTransporterOwner,
    wagonsByTransporter: groupBy(
      wagons,
      (row) => row.transporter,
      (row) => row.product,
      vehicleKey,
      () => 0
    ).map(({ name, product, count }) => ({ name, product, count })),
    wagonWeightByOwner: groupBy(
      wagons,
      (row) => row.goodsOwner,
      (row) => row.product,
      vehicleKey,
      positiveWeight
    ).map(({ name, product, weight }) => ({ name, product, weight })),
    trucksByOwner: groupBy(
      trucks,
      (row) => row.goodsOwner,
      (row) => row.product,
      vehicleKey,
      positiveWeight
    ),
    weightByStorage: groupBy(
      rows,
      (row) => row.storageLocation,
      (row) => row.product,
      vehicleKey,
      positiveWeight
    ).map(({ name, product, weight }) => ({ name, product, weight })),
    wagonCount: new Set(wagons.map(vehicleKey)).size,
    truckCount: new Set(trucks.map(vehicleKey)).size,
    negativeVehicleCount: new Set(negativeRows.map(vehicleKey)).size,
    totalReceivedWeight: rows.reduce((total, row) => total + positiveWeight(row), 0),
  }
}
