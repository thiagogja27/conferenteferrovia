/**
 * Serviço de Gerenciamento e Resolução de Cadastros Logísticos (Destinatários & Transbordos)
 * 
 * Permite cadastrar novos Destinatários (com CNPJ, Filiais e Aliases) e Transbordos (com CNPJ,
 * Cidade, Operadora e Aliases) a partir da aba Monitor.
 * 
 * Os cadastros são persistidos localmente (localStorage) e sincronizados via Firebase Realtime Database
 * (se conectado), passando a ser imediatamente consultados pelos motores de leitura e classificação
 * de notas (DANFE, XML, PDFs e Dashboards).
 */

import { getDatabaseInstance, getOperatorName } from '@/lib/firebase-realtime'
import { ref, onValue, set, get } from 'firebase/database'

export interface CadastroDestinatario {
  id: string
  nome: string
  cnpjPrincipal: string
  cnpjsAdicionais?: string[]
  aliases: string[]
  cidade?: string
  uf?: string
  observacoes?: string
  isSistema?: boolean
  ativo: boolean
  criadoEm: number
  criadoPor?: string
}

export interface CadastroTransbordo {
  id: string
  nome: string
  cnpj?: string
  cidade?: string
  uf?: string
  operadora?: 'RUMO' | 'VLI' | 'OUTRA' | string
  aliases: string[]
  observacoes?: string
  isSistema?: boolean
  ativo: boolean
  criadoEm: number
  criadoPor?: string
}

const STORAGE_KEY_CUSTOM_DEST = 'vlic_custom_destinatarios_catalog_v2'
const STORAGE_KEY_CUSTOM_TRANS = 'vlic_custom_transbordos_catalog_v2'
const EVENT_CADASTROS_UPDATED = 'cadastros_logisticos_changed'

// -------------------------------------------------------------
// CATÁLOGO PADRÃO DO SISTEMA (DESTINATÁRIOS CONHECIDOS)
// -------------------------------------------------------------
export const SISTEMA_DESTINATARIOS_PADRAO: CadastroDestinatario[] = [
  {
    id: 'sys-dest-btg',
    nome: 'BTG PACTUAL COMMODITIES SERTRADING S.A.',
    cnpjPrincipal: '04.626.426/0001-90',
    cnpjsAdicionais: ['04626426'],
    aliases: ['BTG PACTUAL', 'SERTRADING', 'BTG COMMODITIES', 'BANCO BTG'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-tiete',
    nome: 'TIETE AGROINDUSTRIAL S.A.',
    cnpjPrincipal: '51.843.514/0001-86',
    cnpjsAdicionais: ['51843514'],
    aliases: ['TIETE AGROINDUSTRIAL', 'TIETE', 'TIETÊ', 'USINA TIETE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-alcoeste',
    nome: 'ALCOESTE BIOENERGIA FERNANDOPOLIS S/A',
    cnpjPrincipal: '43.545.284/0001-38',
    cnpjsAdicionais: ['43545284'],
    aliases: ['ALCOESTE BIOENERGIA', 'ALCOESTE FERNANDOPOLIS', 'ALCOESTE'],
    cidade: 'Fernandópolis',
    uf: 'SP',
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-cargill',
    nome: 'CARGILL AGRICOLA SA',
    cnpjPrincipal: '44.934.648/0001-00',
    cnpjsAdicionais: ['44934648'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL AGRÍCOLA', 'CARGILL', 'CARGILL SA'],
    observacoes: 'Atenção: CNPJ 02.387.241 pertence à Rumo S.A. (transportadora) e não à Cargill.',
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-coruripe',
    nome: 'S/A USINA CORURIPE ACUCAR E ALCOOL',
    cnpjPrincipal: '12.229.415/0001-98',
    cnpjsAdicionais: ['12229415'],
    aliases: ['CORURIPE', 'USINA CORURIPE', 'USINA CORURIPE ACUCAR E ALCOOL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-copersucar',
    nome: 'COPERSUCAR S.A.',
    cnpjPrincipal: '60.643.236/0001-08',
    cnpjsAdicionais: ['60643236'],
    aliases: ['COPERSUCAR', 'COPERSUCAR SA', 'COPERSUCAR S/A'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-raizen',
    nome: 'RAIZEN ENERGIA S.A.',
    cnpjPrincipal: '08.070.508/0001-78',
    cnpjsAdicionais: ['08070508'],
    aliases: ['RAIZEN', 'RAÍZEN', 'RAIZEN ENERGIA', 'RAIZEN COMBUSTIVEIS'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-saomartinho',
    nome: 'USINA SAO MARTINHO S/A',
    cnpjPrincipal: '51.466.860/0001-56',
    cnpjsAdicionais: ['51466860'],
    aliases: ['SAO MARTINHO', 'SÃO MARTINHO', 'USINA SAO MARTINHO', 'USINA SÃO MARTINHO'],
    cidade: 'Pradópolis',
    uf: 'SP',
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-adecoagro',
    nome: 'ADECOAGRO VALE DO IVINHEMA S.A.',
    cnpjPrincipal: '05.950.358/0001-83',
    cnpjsAdicionais: ['05950358'],
    aliases: ['ADECOAGRO', 'ADECOAGRO VALE DO IVINHEMA', 'ADECO AGRO'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-altamogiana',
    nome: 'USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL',
    cnpjPrincipal: '44.248.957/0001-90',
    cnpjsAdicionais: ['44248957'],
    aliases: ['ALTA MOGIANA', 'USINA ALTA MOGIANA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-batatais',
    nome: 'USINA BATATAIS S/A ACUCAR E ALCOOL',
    cnpjPrincipal: '44.952.665/0001-89',
    cnpjsAdicionais: ['44952665'],
    aliases: ['BATATAIS', 'USINA BATATAIS'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-tereos',
    nome: 'TEREOS ACUCAR E ENERGIA BRASIL S.A.',
    cnpjPrincipal: '47.080.619/0001-17',
    cnpjsAdicionais: ['47080619'],
    aliases: ['TEREOS', 'GUARANI', 'TEREOS ACUCAR', 'TEREOS BRASIL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-bpbunge',
    nome: 'BP BUNGE BIOENERGIA S.A.',
    cnpjPrincipal: '10.779.985/0001-48',
    cnpjsAdicionais: ['10779985'],
    aliases: ['BP BUNGE', 'BP BUNGE BIOENERGIA', 'BP BIOENERGIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-bomfuturo',
    nome: 'BOM FUTURO AGRICOLA LTDA',
    cnpjPrincipal: '01.249.863/0001-88',
    cnpjsAdicionais: ['01249863'],
    aliases: ['BOM FUTURO', 'BOM FUTURO AGRICOLA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-adm',
    nome: 'ADM DO BRASIL LTDA',
    cnpjPrincipal: '02.012.862/0001-60',
    cnpjsAdicionais: ['02012862'],
    aliases: ['ADM DO BRASIL', 'ADM BRASIL', 'ADM GRAOS', 'ADM '],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-ldc',
    nome: 'LOUIS DREYFUS COMPANY BRASIL S.A.',
    cnpjPrincipal: '47.067.525/0001-38',
    cnpjsAdicionais: ['47067525'],
    aliases: ['LOUIS DREYFUS', 'LOUIS DREUFUS', 'DREYFUS', 'LDC BRASIL', 'LDC'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-bunge',
    nome: 'BUNGE ALIMENTOS S.A.',
    cnpjPrincipal: '84.046.101/0001-93',
    cnpjsAdicionais: ['84046101'],
    aliases: ['BUNGE ALIMENTOS', 'BUNGE BRASIL', 'BUNGE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-amaggi',
    nome: 'AMAGGI EXPORTACAO E IMPORTACAO LTDA',
    cnpjPrincipal: '00.299.056/0001-65',
    cnpjsAdicionais: ['00299056'],
    aliases: ['AMAGGI', 'AMAGGI EXPORTACAO', 'GRUPO AMAGGI'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-coamo',
    nome: 'COAMO AGROINDUSTRIAL COOPERATIVA',
    cnpjPrincipal: '75.904.383/0001-21',
    cnpjsAdicionais: ['75904383'],
    aliases: ['COAMO', 'COAMO AGROINDUSTRIAL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-cvale',
    nome: 'C.VALE COOPERATIVA AGROINDUSTRIAL',
    cnpjPrincipal: '77.858.645/0001-44',
    cnpjsAdicionais: ['77858645'],
    aliases: ['C.VALE', 'C VALE', 'COOPERATIVA C VALE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-viterra',
    nome: 'VITERRA BRASIL S.A.',
    cnpjPrincipal: '02.638.994/0001-22',
    cnpjsAdicionais: ['02638994'],
    aliases: ['VITERRA', 'GLENCORE', 'VITERRA BRASIL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-cofco',
    nome: 'COFCO INTERNATIONAL BRASIL S.A.',
    cnpjPrincipal: '06.315.338/0001-27',
    cnpjsAdicionais: ['06315338'],
    aliases: ['COFCO', 'COFCO INTERNATIONAL', 'COFCO BRASIL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-jalles',
    nome: 'JALLES MACHADO S.A.',
    cnpjPrincipal: '02.635.522/0001-70',
    cnpjsAdicionais: ['02635522'],
    aliases: ['JALLES MACHADO', 'USINA JALLES MACHADO', 'JALLES'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-agrovale',
    nome: 'AGROVALE - AGRO INDUSTRIAS DO VALE DO SAO FRANCISCO S.A.',
    cnpjPrincipal: '14.495.734/0001-09',
    cnpjsAdicionais: ['14495734'],
    aliases: ['AGROVALE', 'VALE DO SAO FRANCISCO'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-santafe',
    nome: 'USINA SANTA FE S/A',
    cnpjPrincipal: '44.218.935/0001-44',
    cnpjsAdicionais: ['44218935'],
    aliases: ['SANTA FE', 'SANTA FÉ', 'USINA SANTA FE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-santaterezinha',
    nome: 'USINA SANTA TEREZINHA LTDA',
    cnpjPrincipal: '75.767.475/0001-38',
    cnpjsAdicionais: ['75767475'],
    aliases: ['SANTA TEREZINHA', 'USACUCAR', 'USINA SANTA TEREZINHA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-caete',
    nome: 'USINA CAETE S/A',
    cnpjPrincipal: '12.200.749/0001-42',
    cnpjsAdicionais: ['12200749'],
    aliases: ['CAETE', 'CAETÉ', 'USINA CAETE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
]

// -------------------------------------------------------------
// CATÁLOGO PADRÃO DO SISTEMA (TRANSBORDOS CONHECIDOS)
// -------------------------------------------------------------
export const SISTEMA_TRANSBORDOS_PADRAO: CadastroTransbordo[] = [
  {
    id: 'sys-trans-fernandopolis',
    nome: 'FERNANDOPOLIS',
    cnpj: '72.451.917/0016-08',
    cidade: 'Fernandópolis',
    uf: 'SP',
    operadora: 'RUMO',
    aliases: ['FERNANDOPOLIS', 'FERNANDÓPOLIS', 'ATT ARMAZENAGEM', '72451917001608', 'FERNANDOPOLIS-SP'],
    observacoes: 'Pátio/Armazém ATT Armazenagem com transbordo rodoferroviário Malha Paulista Rumo.',
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-pradopolis',
    nome: 'PRADOPOLIS',
    cnpj: '51.466.860/0001-56',
    cidade: 'Pradópolis',
    uf: 'SP',
    operadora: 'RUMO',
    aliases: ['PRADOPOLIS', 'PRADÓPOLIS', 'USINA SAO MARTINHO', 'SÃO MARTINHO', 'SAO MARTINHO', 'PRADOPOLIS-SP'],
    observacoes: 'Terminal rodoferroviário da Usina São Martinho / Rumo.',
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-pederneiras',
    nome: 'PEDERNEIRAS (RUMO)',
    cidade: 'Pederneiras',
    uf: 'SP',
    operadora: 'RUMO',
    aliases: ['PEDERNEIRAS', 'PEDERNEIRAS (RUMO)', 'TERMINAL PEDERNEIRAS'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-uberaba',
    nome: 'UBERABA',
    cidade: 'Uberaba',
    uf: 'MG',
    operadora: 'VLI',
    aliases: ['UBERABA', 'TIUB', 'TERMINAL INTERMODAL DE UBERABA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-altotaquari',
    nome: 'ALTO TAQUARI',
    cidade: 'Alto Taquari',
    uf: 'MT',
    operadora: 'RUMO',
    aliases: ['ALTO TAQUARI', 'NOVA AGRI', 'NOVA-AGRI', 'NOVAAGRI', 'NOVA AGRI - ALTO TAQUARI'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-rondonopolis',
    nome: 'RONDONOPOLIS (RUMO)',
    cidade: 'Rondonópolis',
    uf: 'MT',
    operadora: 'RUMO',
    aliases: ['RONDONOPOLIS', 'RONDONÓPOLIS', 'RONDONOPOLIS (RUMO)', 'MALHA NORTE', 'COMPLEXO RONDONOPOLIS'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-rioverde',
    nome: 'RIO VERDE',
    cidade: 'Rio Verde',
    uf: 'GO',
    operadora: 'RUMO',
    aliases: ['RIO VERDE', 'TERMINAL RIO VERDE', 'FNS RIO VERDE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-araguari',
    nome: 'ARAGUARI (VLI)',
    cidade: 'Araguari',
    uf: 'MG',
    operadora: 'VLI',
    aliases: ['ARAGUARI', 'ARAGUARI (VLI)', 'TERMINAL INTEGRADO ARAGUARI', 'TIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-iturama',
    nome: 'ITURAMA',
    cidade: 'Iturama',
    uf: 'MG',
    operadora: 'RUMO',
    aliases: ['ITURAMA', 'TRANSBORDO ITURAMA', 'CORURIPE ITURAMA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-guara',
    nome: 'GUARA',
    cidade: 'Guará',
    uf: 'SP',
    operadora: 'VLI',
    aliases: ['GUARA', 'GUARÁ', 'PATIO GUARA', 'PÁTIO GUARÁ'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-uberlandia',
    nome: 'UBERLANDIA',
    cidade: 'Uberlândia',
    uf: 'MG',
    operadora: 'VLI',
    aliases: ['UBERLANDIA', 'UBERLÂNDIA', 'TRANSBORDO UBERLANDIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-saosimao',
    nome: 'SAO SIMAO',
    cidade: 'São Simão',
    uf: 'GO',
    operadora: 'RUMO',
    aliases: ['SAO SIMAO', 'SÃO SIMÃO', 'FNS SAO SIMAO'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-chapadao',
    nome: 'CHAPADAO DO SUL',
    cidade: 'Chapadão do Sul',
    uf: 'MS',
    operadora: 'RUMO',
    aliases: ['CHAPADAO DO SUL', 'CHAPADÃO DO SUL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-inocencia',
    nome: 'INOCENCIA',
    cidade: 'Inocência',
    uf: 'MS',
    operadora: 'RUMO',
    aliases: ['INOCENCIA', 'INOCÊNCIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-itiquira',
    nome: 'ITIQUIRA',
    cidade: 'Itiquira',
    uf: 'MT',
    operadora: 'RUMO',
    aliases: ['ITIQUIRA', 'TERMINAL ITIQUIRA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-altoaraguaia',
    nome: 'ALTO ARAGUAIA',
    cidade: 'Alto Araguaia',
    uf: 'MT',
    operadora: 'RUMO',
    aliases: ['ALTO ARAGUAIA', 'ARAGUAIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-santaadelia',
    nome: 'SANTA ADELIA',
    cidade: 'Santa Adélia',
    uf: 'SP',
    operadora: 'RUMO',
    aliases: ['SANTA ADELIA', 'SANTA ADÉLIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-domaquino',
    nome: 'DOM AQUINO',
    cidade: 'Dom Aquino',
    uf: 'MT',
    operadora: 'RUMO',
    aliases: ['DOM AQUINO'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-riopreto',
    nome: 'RIO PRETO',
    cidade: 'São José do Rio Preto',
    uf: 'SP',
    operadora: 'RUMO',
    aliases: ['RIO PRETO', 'SAO JOSE DO RIO PRETO', 'SÃO JOSÉ DO RIO PRETO'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-trans-armazensgerais',
    nome: 'COMPANHIA AUXILIAR DE ARMAZENS GERAIS',
    aliases: ['COMPANHIA AUXILIAR', 'CIA AUXILIAR', 'AUXILIAR ARMAZENS'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
]

// -------------------------------------------------------------
// FUNÇÕES AUXILIARES DE NORMALIZAÇÃO
// -------------------------------------------------------------
function cleanDigits(val?: string): string {
  return (val || '').replace(/\D/g, '')
}

function normalizeSearch(val?: string): string {
  if (!val) return ''
  return val
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// -------------------------------------------------------------
// STORAGE LOCAL E NOTIFICAÇÃO DE EVENTOS
// -------------------------------------------------------------
function loadLocalCustomDestinatarios(): CadastroDestinatario[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_DEST)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Erro ao ler custom_destinatarios do localStorage:', err)
    return []
  }
}

function saveLocalCustomDestinatarios(list: CadastroDestinatario[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_DEST, JSON.stringify(list))
    notifyCadastrosChanged()
  } catch (err) {
    console.error('Erro ao salvar custom_destinatarios no localStorage:', err)
  }
}

function loadLocalCustomTransbordos(): CadastroTransbordo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TRANS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Erro ao ler custom_transbordos do localStorage:', err)
    return []
  }
}

function saveLocalCustomTransbordos(list: CadastroTransbordo[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_TRANS, JSON.stringify(list))
    notifyCadastrosChanged()
  } catch (err) {
    console.error('Erro ao salvar custom_transbordos no localStorage:', err)
  }
}

function notifyCadastrosChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_CADASTROS_UPDATED))
  }
}

// -------------------------------------------------------------
// API PÚBLICA DE DESTINATÁRIOS
// -------------------------------------------------------------
export function getAllDestinatarios(): CadastroDestinatario[] {
  const custom = loadLocalCustomDestinatarios()
  // Customizados aparecem primeiro para sobrepor ou priorizar
  return [...custom, ...SISTEMA_DESTINATARIOS_PADRAO]
}

export function getCustomDestinatarios(): CadastroDestinatario[] {
  return loadLocalCustomDestinatarios()
}

export function saveCustomDestinatario(
  item: Omit<CadastroDestinatario, 'id' | 'isSistema' | 'criadoEm'> & { id?: string }
): CadastroDestinatario {
  const current = loadLocalCustomDestinatarios()
  const now = Date.now()
  const operator = getOperatorName()

  const cleanCnpj = cleanDigits(item.cnpjPrincipal)
  const id = item.id || `custom-dest-${cleanCnpj || now}`

  const newEntry: CadastroDestinatario = {
    ...item,
    id,
    cnpjPrincipal: item.cnpjPrincipal.trim(),
    cnpjsAdicionais: (item.cnpjsAdicionais || []).map((c) => c.trim()).filter(Boolean),
    aliases: (item.aliases || []).map((a) => a.trim()).filter(Boolean),
    isSistema: false,
    ativo: item.ativo !== false,
    criadoEm: now,
    criadoPor: item.criadoPor || operator,
  }

  const existingIdx = current.findIndex((c) => c.id === id)
  let updatedList: CadastroDestinatario[] = []

  if (existingIdx >= 0) {
    updatedList = [...current]
    updatedList[existingIdx] = newEntry
  } else {
    updatedList = [newEntry, ...current]
  }

  saveLocalCustomDestinatarios(updatedList)

  // Sincroniza em segundo plano com Firebase Realtime Database se conectado
  pushToFirebase('destinatarios', newEntry)

  return newEntry
}

export function deleteCustomDestinatario(id: string): boolean {
  const current = loadLocalCustomDestinatarios()
  const filtered = current.filter((c) => c.id !== id)
  if (filtered.length !== current.length) {
    saveLocalCustomDestinatarios(filtered)
    deleteFromFirebase('destinatarios', id)
    return true
  }
  return false
}

// -------------------------------------------------------------
// API PÚBLICA DE TRANSBORDOS
// -------------------------------------------------------------
export function getAllTransbordos(): CadastroTransbordo[] {
  const custom = loadLocalCustomTransbordos()
  return [...custom, ...SISTEMA_TRANSBORDOS_PADRAO]
}

export function getCustomTransbordos(): CadastroTransbordo[] {
  return loadLocalCustomTransbordos()
}

export function saveCustomTransbordo(
  item: Omit<CadastroTransbordo, 'id' | 'isSistema' | 'criadoEm'> & { id?: string }
): CadastroTransbordo {
  const current = loadLocalCustomTransbordos()
  const now = Date.now()
  const operator = getOperatorName()

  const id = item.id || `custom-trans-${normalizeSearch(item.nome).replace(/[^A-Z0-9]/g, '_') || now}`

  const newEntry: CadastroTransbordo = {
    ...item,
    id,
    nome: item.nome.trim().toUpperCase(),
    cnpj: item.cnpj ? item.cnpj.trim() : undefined,
    aliases: (item.aliases || []).map((a) => a.trim()).filter(Boolean),
    isSistema: false,
    ativo: item.ativo !== false,
    criadoEm: now,
    criadoPor: item.criadoPor || operator,
  }

  const existingIdx = current.findIndex((c) => c.id === id)
  let updatedList: CadastroTransbordo[] = []

  if (existingIdx >= 0) {
    updatedList = [...current]
    updatedList[existingIdx] = newEntry
  } else {
    updatedList = [newEntry, ...current]
  }

  saveLocalCustomTransbordos(updatedList)

  // Sincroniza em segundo plano com Firebase Realtime Database se conectado
  pushToFirebase('transbordos', newEntry)

  return newEntry
}

export function deleteCustomTransbordo(id: string): boolean {
  const current = loadLocalCustomTransbordos()
  const filtered = current.filter((c) => c.id !== id)
  if (filtered.length !== current.length) {
    saveLocalCustomTransbordos(filtered)
    deleteFromFirebase('transbordos', id)
    return true
  }
  return false
}

// -------------------------------------------------------------
// SINCRONIZAÇÃO EM TEMPO REAL COM O FIREBASE
// -------------------------------------------------------------
function pushToFirebase(type: 'destinatarios' | 'transbordos', entry: any): void {
  try {
    const db = getDatabaseInstance()
    if (!db) return
    const entryRef = ref(db, `cadastros_logisticos/${type}/${entry.id}`)
    set(entryRef, entry).catch((e) => {
      console.warn(`[Cadastros] Não foi possível sincronizar ${type} com Firebase:`, e.message)
    })
  } catch (err) {
    // silencioso para não interromper modo offline/local
  }
}

function deleteFromFirebase(type: 'destinatarios' | 'transbordos', id: string): void {
  try {
    const db = getDatabaseInstance()
    if (!db) return
    const entryRef = ref(db, `cadastros_logisticos/${type}/${id}`)
    set(entryRef, null).catch(() => {})
  } catch (err) {}
}

export function subscribeToRemoteCadastros(): () => void {
  try {
    const db = getDatabaseInstance()
    if (!db) return () => {}

    const destRef = ref(db, 'cadastros_logisticos/destinatarios')
    const transRef = ref(db, 'cadastros_logisticos/transbordos')

    const unsubDest = onValue(destRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val()
        const remoteList: CadastroDestinatario[] = Object.values(val)
        if (remoteList.length > 0) {
          const local = loadLocalCustomDestinatarios()
          // Mescla remote com local garantindo IDs únicos
          const map = new Map<string, CadastroDestinatario>()
          local.forEach((l) => map.set(l.id, l))
          remoteList.forEach((r) => map.set(r.id, r))
          const merged = Array.from(map.values())
          if (JSON.stringify(merged) !== JSON.stringify(local)) {
            saveLocalCustomDestinatarios(merged)
          }
        }
      }
    })

    const unsubTrans = onValue(transRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val()
        const remoteList: CadastroTransbordo[] = Object.values(val)
        if (remoteList.length > 0) {
          const local = loadLocalCustomTransbordos()
          const map = new Map<string, CadastroTransbordo>()
          local.forEach((l) => map.set(l.id, l))
          remoteList.forEach((r) => map.set(r.id, r))
          const merged = Array.from(map.values())
          if (JSON.stringify(merged) !== JSON.stringify(local)) {
            saveLocalCustomTransbordos(merged)
          }
        }
      }
    })

    return () => {
      unsubDest()
      unsubTrans()
    }
  } catch (err) {
    return () => {}
  }
}

export function subscribeCadastrosChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT_CADASTROS_UPDATED, callback)
  const unsubRemote = subscribeToRemoteCadastros()
  return () => {
    window.removeEventListener(EVENT_CADASTROS_UPDATED, callback)
    unsubRemote()
  }
}

// -------------------------------------------------------------
// MOTORES DE RECONHECIMENTO ATIVO (BUSCA NAS NOTAS)
// -------------------------------------------------------------

/**
 * Busca por correspondência de Destinatário nos cadastros (Personalizados + Padrão).
 * 
 * Verifica por:
 * 1. CNPJ Principal (14 dígitos ou 8 dígitos de raiz)
 * 2. CNPJs adicionais/filiais
 * 3. Nome ou Aliases presentes no nome extraído ou no texto completo (infCpl)
 */
export function matchDestinatarioFromTextOrCnpj(
  rawNome?: string,
  rawCnpj?: string,
  fullText?: string
): string | null {
  const allDest = getAllDestinatarios().filter((d) => d.ativo !== false)

  const cnpjClean = cleanDigits(rawCnpj)
  const cnpjRoot = cnpjClean.length >= 8 ? cnpjClean.slice(0, 8) : ''

  const targetNomeNorm = normalizeSearch(rawNome)
  const targetFullNorm = normalizeSearch(fullText)
  const combinedNorm = `${targetNomeNorm} ${targetFullNorm}`

  // 1. Prioridade máxima: CNPJ exato ou raiz de CNPJ
  if (cnpjClean) {
    for (const dest of allDest) {
      const destCnpjClean = cleanDigits(dest.cnpjPrincipal)
      if (destCnpjClean && (destCnpjClean === cnpjClean || (cnpjRoot && destCnpjClean.startsWith(cnpjRoot)))) {
        return dest.nome
      }

      if (dest.cnpjsAdicionais) {
        for (const adCnpj of dest.cnpjsAdicionais) {
          const adClean = cleanDigits(adCnpj)
          if (adClean && (adClean === cnpjClean || (cnpjRoot && adClean.startsWith(cnpjRoot)))) {
            return dest.nome
          }
        }
      }
    }
  }

  // 2. Prioridade 2: Busca por CNPJ contido no fullText / infCpl
  if (targetFullNorm) {
    for (const dest of allDest) {
      const destCnpjClean = cleanDigits(dest.cnpjPrincipal)
      if (destCnpjClean && destCnpjClean.length === 14) {
        // Formato com pontuação ou dígitos diretos
        const cnpjFmt = `${destCnpjClean.slice(0, 2)}.${destCnpjClean.slice(2, 5)}.${destCnpjClean.slice(5, 8)}/${destCnpjClean.slice(8, 12)}-${destCnpjClean.slice(12, 14)}`
        if (targetFullNorm.includes(destCnpjClean) || targetFullNorm.includes(cnpjFmt)) {
          return dest.nome
        }
      }
    }
  }

  // 3. Prioridade 3: Nome do cadastro ou Aliases no nome ou no texto
  // Testar customizados primeiro
  for (const dest of allDest) {
    const destNomeNorm = normalizeSearch(dest.nome)
    if (destNomeNorm && targetNomeNorm.includes(destNomeNorm)) {
      return dest.nome
    }

    if (dest.aliases && dest.aliases.length > 0) {
      for (const alias of dest.aliases) {
        const aliasNorm = normalizeSearch(alias)
        if (aliasNorm.length >= 3) {
          // Busca exata como palavra ou substring
          if (targetNomeNorm.includes(aliasNorm)) {
            return dest.nome
          }
        }
      }
    }
  }

  // 4. Prioridade 4: Se o nome era genérico / não informado, buscar aliases no infCpl (fullText)
  if (targetFullNorm) {
    for (const dest of allDest) {
      if (dest.aliases && dest.aliases.length > 0) {
        for (const alias of dest.aliases) {
          const aliasNorm = normalizeSearch(alias)
          if (aliasNorm.length >= 4) {
            // Regex para evitar falsos positivos
            const escaped = aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(`\\b${escaped}\\b`, 'i')
            if (regex.test(targetFullNorm)) {
              return dest.nome
            }
          }
        }
      }
    }
  }

  return null
}

/**
 * Busca por correspondência de Transbordo nos cadastros (Personalizados + Padrão).
 * 
 * Verifica por:
 * 1. CNPJ do armazém/transbordo no texto
 * 2. Nome do transbordo ou cidade
 * 3. Aliases/palavras-chave específicas configuradas pelo usuário
 */
export function matchTransbordoFromText(text?: string): string | null {
  if (!text) return null
  const allTrans = getAllTransbordos().filter((t) => t.ativo !== false)
  const normText = normalizeSearch(text)

  // 1. Procura por CNPJ de transbordos cadastrados (customizados e padrão)
  for (const t of allTrans) {
    if (t.cnpj) {
      const clean = cleanDigits(t.cnpj)
      if (clean && clean.length >= 8) {
        if (normText.includes(clean)) {
          return t.nome
        }
        // formato pontuado
        if (clean.length === 14) {
          const fmt = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`
          if (normText.includes(fmt)) {
            return t.nome
          }
        }
      }
    }
  }

  // 2. Procura por Nome ou Aliases dos transbordos
  // Customizados são avaliados primeiro
  for (const t of allTrans) {
    const nomeNorm = normalizeSearch(t.nome)
    if (nomeNorm.length >= 4) {
      const escaped = nomeNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(?:TRANSBORDO|LOCAL|CIDADE|EM|NO|NA)?\\s*\\b${escaped}\\b`, 'i')
      if (regex.test(normText)) {
        return t.nome
      }
    }

    if (t.aliases && t.aliases.length > 0) {
      for (const alias of t.aliases) {
        const aliasNorm = normalizeSearch(alias)
        if (aliasNorm.length >= 3) {
          const escaped = aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`\\b${escaped}\\b`, 'i')
          if (regex.test(normText)) {
            return t.nome
          }
        }
      }
    }

    // Se tiver cidade e a palavra "TRANSBORDO" estiver próxima
    if (t.cidade) {
      const cidNorm = normalizeSearch(t.cidade)
      if (cidNorm.length >= 4) {
        const escaped = cidNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(?:TRANSBORDO|SOFRERA\\s+TRANSBORDO)\\s*[:=-]?\\s*.*?\\b${escaped}\\b`, 'i')
        if (regex.test(normText)) {
          return t.nome
        }
      }
    }
  }

  return null
}
