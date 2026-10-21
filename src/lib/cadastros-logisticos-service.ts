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
import { ref, onValue, set, get, query, limitToLast } from 'firebase/database'

export interface CadastroDestinatario {
  id: string
  nome: string
  nomenclatura?: string
  nomenclaturaRemetente?: string
  cnpjPrincipal: string
  contrato?: ContratoDestinatario
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

export const CONTRATOS_DESTINATARIO = [
  'CGL-T',
  'SUISSE',
  'LDC',
  'LDC-T',
  'CGL',
  'RAIZEN',
  'RAIZEN-T',
  'SUISSE-T',
] as const

export type ContratoDestinatario = (typeof CONTRATOS_DESTINATARIO)[number]

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
const STORAGE_KEY_DEST_CONTRACTS = 'vlic_destinatario_contratos_v1'
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
    id: 'sys-dest-ALCOOLVALE S/A ALCOOL E ACUCAR',
    nome: 'ALCOOLVALE S/A ALCOOL E ACUCAR',
    cnpjPrincipal: '15.444.904/0001-83',
    cnpjsAdicionais: ['04626426'],
    aliases: ['ALCOOLVALE S/A ALCOOL E ACUCAR'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-lins',
    nome: 'LINS AGROINDUSTRIAL S.A.',
    cnpjPrincipal: '35.637.796/0001-72',
    cnpjsAdicionais: ['35637796'],
    aliases: ['LINS AGROINDUSTRIAL', 'LINS', 'USINA LINS'],
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
    id: 'sys-dest-tiete-0001-40',
    nome: 'TIETE AGROINDUSTRIAL S.A.',
    cnpjPrincipal: '51.843.514/0001-40',
    cnpjsAdicionais: ['51843514'],
    aliases: ['TIETE AGROINDUSTRIAL', 'TIETE', 'TIETÊ', 'USINA TIETE'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-da-mata',
    nome: 'DA MATA S.A. - ACUCAR E ALCOOL',
    cnpjPrincipal: '08.110.543/0001-73',
    cnpjsAdicionais: ['08110543'],
    aliases: ['DA MATA', 'USINA DA MATA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-enersugar',
    nome: 'USINA ENERSUGAR S/A ACUCAR E ALCOOL',
    cnpjPrincipal: '34.656.444/0001-00',
    cnpjsAdicionais: ['34656444'],
    aliases: ['USINA ENERSUGAR', 'ENERSUGAR'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-nardini-apore',
    nome: 'NARDINI AGRO-(APORE-INDUSTRIA)',
    cnpjPrincipal: '48.708.267/0015-60',
    cnpjsAdicionais: ['48708267'],
    aliases: ['NARDINI AGRO', 'NARDINI APORE', 'NARDINI INDUSTRIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-cargill-0288',
    nome: 'CARGILL AGRICOLA SA.',
    cnpjPrincipal: '60.498.706/0288-33',
    cnpjsAdicionais: ['60498706028833', '0498706028'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
    {
    id: 'sys-dest-cargill-0066',
    nome: 'CARGILL AGRICOLA SA.',
    cnpjPrincipal: '60.498.706/0066-00',
    cnpjsAdicionais: ['60498706006600', '4987060066'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

   {
    id: 'sys-dest-cargill-0058',
    nome: 'CARGILL AGRICOLA SA.',
    cnpjPrincipal: '60.498.706/0058-92',
    cnpjsAdicionais: ['60498706005892', '4987060058'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

   {
    id: 'sys-dest-cargill-0075',
    nome: 'CARGILL AGRICOLA SA.',
    cnpjPrincipal: '60.498.706/0075-93',
    cnpjsAdicionais: ['60498706007593', '4987060075'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

  {
    id: 'sys-dest-cargill-0300',
    nome: 'CARGILL AGRICOLA SA.',
    cnpjPrincipal: '60.498.706/0300-64',
    cnpjsAdicionais: ['60498706030064', '4987060300'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

   {
    id: 'sys-dest-cargill-0314',
    nome: 'CARGILL AGRICOLA SA.',
    cnpjPrincipal: '60.498.706/0314-60',
    cnpjsAdicionais: ['4987060314'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

  {
    id: 'sys-dest-ldc-0199-84',
    nome: 'LOUIS DREYFUS COMPANY BRASIL S A.',
    cnpjPrincipal: '47.067.525/0199-84',
    cnpjsAdicionais: [],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

  {
    id: 'sys-dest-ldc-0168-88',
    nome: 'LOUIS DREYFUS COMPANY BRASIL S A.',
    cnpjPrincipal: '47.067.525/0168-88',
    cnpjsAdicionais: ['0675250168'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

  {
    id: 'sys-dest-ldc-0112-23',
    nome: 'LOUIS DREYFUS COMPANY BRASIL S A.',
    cnpjPrincipal: '47.067.525/0112-23',
    cnpjsAdicionais: ['0675250112'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },


   {
    id: 'sys-dest-ldc-0130-05',
    nome: 'LOUIS DREYFUS COMPANY BRASIL S A.',
    cnpjPrincipal: '47.067.525/0130-05',
    cnpjsAdicionais: ['0675250130'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },

  {
    id: 'sys-dest-ldc-0107-66',
    nome: 'LOUIS DREYFUS COMPANY BRASIL S A',
    cnpjPrincipal: '47.067.525/0107-66',
    cnpjsAdicionais: ['0675250107'],
    aliases: ['CARGILL AGRICOLA', 'CARGILL'],
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
    id: 'sys-dest-coruripe-carneirinho',
    nome: 'S/A USINA CORURIPE ACUCAR E ALCOOL FILIAL CARNEIRINHO',
    cnpjPrincipal: '12.229.415/0023-26',
    cnpjsAdicionais: ['12229415002326'],
    aliases: [
      'CORURIPE FILIAL CARNEIRINHO',
      'USINA CORURIPE CARNEIRINHO',
      'S/A USINA CORURIPE ACUCAR E ALCOOL CARNEIRINHO',
      '12229415002326',
    ],
    cidade: 'Carneirinho',
    uf: 'MG',
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-coruripe-0010',
    nome: 'S/A USINA CORURIPE ACUCAR E ALCOOL',
    cnpjPrincipal: '12.229.415/0010-01',
    aliases: [],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-coruripe-0016',
    nome: 'S/A USINA CORURIPE ACUCAR E ALCOOL',
    cnpjPrincipal: '12.229.415/0016-05',
    cnpjsAdicionais: ['12229415001605'],
    aliases: ['CORURIPE 0016', 'USINA CORURIPE 0016', '12.229.415/0016-05'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-canapolis',
    nome: 'CANAPOLIS ACUCAR E ETANOL S.A',
    cnpjPrincipal: '28.144.326/0001-01',
    cnpjsAdicionais: ['28144326'],
    aliases: ['CANAPOLIS ACUCAR E ETANOL', 'CANÁPOLIS AÇÚCAR E ETANOL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-bioenergetica-aroeira',
    nome: 'BIOENERGETICA AROEIRA S.A.',
    cnpjPrincipal: '08.355.201/0001-13',
    aliases: ['BIOENERGETICA AROEIRA', 'BIOENERGÉTICA AROEIRA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-delta-sucroenergia-0003',
    nome: 'DELTA SUCROENERGIA S.A',
    cnpjPrincipal: '13.537.735/0003-62',
    aliases: ['DELTA SUCROENERGIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-sjc-bioenergia-0002',
    nome: 'SJC BIOENERGIA LTDA',
    cnpjPrincipal: '10.249.419/0002-16',
    aliases: ['SJC BIOENERGIA'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-santa-vitoria',
    nome: 'SANTA VITORIA ACUCAR E ALCOOL LTDA',
    cnpjPrincipal: '07.981.751/0001-85',
    cnpjsAdicionais: ['07981751'],
    aliases: ['SANTA VITORIA', 'SANTA VITORIA ACUCAR E ALCOOL'],
    isSistema: true,
    ativo: true,
    criadoEm: 1700000000000,
  },
  {
    id: 'sys-dest-vale-do-pontal',
    nome: 'VALE DO PONTAL ACUCAR E ETANOL S.A.',
    cnpjPrincipal: '08.057.019/0001-86',
    cnpjsAdicionais: ['08057019'],
    aliases: ['VALE DO PONTAL', 'VALE DO PONTAL ACUCAR E ETANOL'],
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
    throw err
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

function loadLocalDestinatarioContracts(): Record<string, ContratoDestinatario> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEST_CONTRACTS)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, ContratoDestinatario] =>
        CONTRATOS_DESTINATARIO.includes(entry[1] as ContratoDestinatario)
      )
    )
  } catch (err) {
    console.error('Erro ao ler contratos dos destinatários do localStorage:', err)
    return {}
  }
}

function saveLocalDestinatarioContracts(contracts: Record<string, ContratoDestinatario>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_DEST_CONTRACTS, JSON.stringify(contracts))
    notifyCadastrosChanged()
  } catch (err) {
    console.error('Erro ao salvar contratos dos destinatários no localStorage:', err)
    throw err
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
  const contracts = loadLocalDestinatarioContracts()
  const systemDefaults = SISTEMA_DESTINATARIOS_PADRAO.filter((systemEntry) =>
    !custom.some((customEntry) => overridesSystemRecipient(customEntry, systemEntry))
  )
  return [...custom, ...systemDefaults].map((destinatario) => ({
    ...destinatario,
    contrato: contracts[cleanDigits(destinatario.cnpjPrincipal)] || destinatario.contrato,
  }))
}

export function getDestinatarioContractByCnpj(cnpj?: string): ContratoDestinatario | undefined {
  const cleanCnpj = cleanDigits(cnpj)
  if (!cleanCnpj) return undefined

  const recipients = getAllDestinatarios()
  const matchingRecipient =
    recipients.find((destinatario) =>
      [destinatario.cnpjPrincipal, ...(destinatario.cnpjsAdicionais || [])]
        .map(cleanDigits)
        .includes(cleanCnpj)
    ) ||
    recipients.find((destinatario) =>
      [destinatario.cnpjPrincipal, ...(destinatario.cnpjsAdicionais || [])]
        .map(cleanDigits)
        .some((recipientCnpj) => recipientCnpj.length === 8 && cleanCnpj.startsWith(recipientCnpj))
    )

  return matchingRecipient?.contrato
}

function getDestinatarioByCnpj(cnpj?: string): CadastroDestinatario | undefined {
  const cleanCnpj = cleanDigits(cnpj)
  if (!cleanCnpj) return undefined

  const recipients = getAllDestinatarios()
  return (
    recipients.find((destinatario) =>
      [destinatario.cnpjPrincipal, ...(destinatario.cnpjsAdicionais || [])]
        .map(cleanDigits)
        .includes(cleanCnpj)
    ) ||
    recipients.find((destinatario) =>
      [destinatario.cnpjPrincipal, ...(destinatario.cnpjsAdicionais || [])]
        .map(cleanDigits)
        .some((recipientCnpj) => recipientCnpj.length === 8 && cleanCnpj.startsWith(recipientCnpj))
    )
  )
}

export function getDestinatarioNomenclatureByCnpj(cnpj?: string): string | undefined {
  return getDestinatarioByCnpj(cnpj)?.nomenclatura
}

export function getRemetenteNomenclatureByCnpj(cnpj?: string): string | undefined {
  return getDestinatarioByCnpj(cnpj)?.nomenclaturaRemetente
}

export async function saveDestinatarioContract(
  cnpj: string,
  contract: ContratoDestinatario | ''
): Promise<void> {
  const cleanCnpj = cleanDigits(cnpj)
  if (!cleanCnpj) throw new Error('CNPJ do destinatário inválido para salvar o contrato.')
  if (contract && !CONTRATOS_DESTINATARIO.includes(contract)) {
    throw new Error('Contrato selecionado inválido.')
  }

  const contracts = loadLocalDestinatarioContracts()
  if (contract) contracts[cleanCnpj] = contract
  else delete contracts[cleanCnpj]
  saveLocalDestinatarioContracts(contracts)

  const db = getDatabaseInstance()
  if (!db) throw new Error('Firebase Realtime Database não está disponível.')

  try {
    await set(ref(db, `cadastros_logisticos/contratos_destinatarios/${cleanCnpj}`), contract || null)
  } catch (err) {
    console.error('Não foi possível sincronizar o contrato do destinatário com Firebase:', err)
    throw err
  }
}

function overridesSystemRecipient(
  customEntry: CadastroDestinatario,
  systemEntry: CadastroDestinatario
): boolean {
  const customCnpjs = [customEntry.cnpjPrincipal, ...(customEntry.cnpjsAdicionais || [])]
    .map(cleanDigits)
    .filter(Boolean)
  const systemCnpjs = [systemEntry.cnpjPrincipal, ...(systemEntry.cnpjsAdicionais || [])]
    .map(cleanDigits)
    .filter(Boolean)

  return systemCnpjs.some((systemCnpj) => customCnpjs.some((customCnpj) =>
    customCnpj === systemCnpj ||
    (customCnpj.length === 8 && systemCnpj.length === 14 && systemCnpj.startsWith(customCnpj))
  ))
}

export function getCustomDestinatarios(): CadastroDestinatario[] {
  return loadLocalCustomDestinatarios()
}

export async function saveCustomDestinatario(
  item: Omit<CadastroDestinatario, 'id' | 'isSistema' | 'criadoEm'> & { id?: string }
): Promise<CadastroDestinatario> {
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

  await syncToFirebase('destinatarios', newEntry)

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
    set(entryRef, entry).catch((err) => {
      console.warn(`[Cadastros] Não foi possível sincronizar ${type} com Firebase:`, err)
    })
  } catch (err) {
    console.warn(`[Cadastros] Não foi possível iniciar a sincronização de ${type} com Firebase:`, err)
  }
}

async function syncToFirebase(type: 'destinatarios' | 'transbordos', entry: any): Promise<void> {
  try {
    const db = getDatabaseInstance()
    if (!db) throw new Error('Firebase Realtime Database não está disponível.')
    const entryRef = ref(db, `cadastros_logisticos/${type}/${entry.id}`)
    await set(entryRef, entry)
  } catch (err) {
    console.error(`[Cadastros] Não foi possível sincronizar ${type} com Firebase:`, err)
    throw err
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
    const contractsRef = ref(db, 'cadastros_logisticos/contratos_destinatarios')

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

    const unsubContracts = onValue(contractsRef, (snap) => {
      if (!snap.exists()) return
      const remoteContracts = snap.val()
      if (!remoteContracts || typeof remoteContracts !== 'object' || Array.isArray(remoteContracts)) return

      const localContracts = loadLocalDestinatarioContracts()
      const mergedContracts = { ...localContracts }
      Object.entries(remoteContracts).forEach(([cnpj, contract]) => {
        if (CONTRATOS_DESTINATARIO.includes(contract as ContratoDestinatario)) {
          mergedContracts[cleanDigits(cnpj)] = contract as ContratoDestinatario
        } else {
          delete mergedContracts[cleanDigits(cnpj)]
        }
      })
      if (JSON.stringify(mergedContracts) !== JSON.stringify(localContracts)) {
        saveLocalDestinatarioContracts(mergedContracts)
      }
    })

    return () => {
      unsubDest()
      unsubTrans()
      unsubContracts()
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
  _fullText?: string
): string | null {
  const allDest = getAllDestinatarios().filter((d) => d.ativo !== false)
  const cnpjClean = cleanDigits(rawCnpj)
  const targetNomeNorm = normalizeSearch(rawNome)

  if (cnpjClean) {
    const cnpjMatch = findDestinatarioByCnpj(allDest, cnpjClean)
    if (cnpjMatch) return cnpjMatch.nome
    if (cnpjClean.length === 14) return null
  }

  const nameMatches = allDest.flatMap((dest) => {
    const candidates = [dest.nome, ...(dest.aliases || [])]
      .map(normalizeSearch)
      .filter((candidate) => candidate.length >= 3 && targetNomeNorm.includes(candidate))
    const longestMatch = candidates.sort((a, b) => b.length - a.length)[0]
    return longestMatch ? [{ dest, matchLength: longestMatch.length }] : []
  }).sort((a, b) => b.matchLength - a.matchLength)
  if (nameMatches.length > 0) return nameMatches[0].dest.nome

  return null
}

export function resolveDestinatarioCadastro(
  rawNome?: string,
  rawCnpj?: string
): { nome: string; cnpj: string } | null {
  const allDest = getAllDestinatarios().filter((dest) => dest.ativo !== false)
  const cnpjClean = cleanDigits(rawCnpj)

  if (cnpjClean) {
    const cnpjMatch = findDestinatarioByCnpj(allDest, cnpjClean)
    if (cnpjMatch) return { nome: cnpjMatch.nome, cnpj: cnpjClean }
    return null
  }

  const targetName = normalizeSearch(rawNome)
  if (!targetName) return null

  const matches = allDest.flatMap((dest) => {
    const candidates = [dest.nome, ...(dest.aliases || [])]
      .map(normalizeSearch)
      .filter((candidate) => candidate.length >= 6 && targetName.includes(candidate))
    const longestMatch = candidates.sort((a, b) => b.length - a.length)[0]
    return longestMatch ? [{ dest, matchLength: longestMatch.length }] : []
  }).sort((a, b) => b.matchLength - a.matchLength)

  const match = matches[0]
  if (!match) return null

  return {
    nome: match.dest.nome,
    cnpj: '',
  }
}

function findDestinatarioByCnpj(
  destinatarios: CadastroDestinatario[],
  cnpj: string
): CadastroDestinatario | null {
  const registeredCnpjs = (dest: CadastroDestinatario) =>
    [dest.cnpjPrincipal, ...(dest.cnpjsAdicionais || [])].map(cleanDigits).filter(Boolean)

  const exactMatch = destinatarios.find((dest) => registeredCnpjs(dest).includes(cnpj))
  if (exactMatch) return exactMatch

  if (cnpj.length === 14) {
    const root = cnpj.slice(0, 8)
    return destinatarios.find((dest) => registeredCnpjs(dest).includes(root)) || null
  }

  if (cnpj.length === 8) {
    return destinatarios.find((dest) => registeredCnpjs(dest).some(
      (registeredCnpj) => registeredCnpj.length === 14 && registeredCnpj.startsWith(cnpj)
    )) || null
  }

  return null
}

export interface SavedNoteRecipient {
  nome: string
  cnpj: string
}

let savedNoteRecipientsCache: SavedNoteRecipient[] = []
let savedNoteRecipientsCacheAt = 0
let savedNoteRecipientsRequest: Promise<SavedNoteRecipient[]> | null = null

async function getSavedNoteRecipients(): Promise<SavedNoteRecipient[]> {
  if (Date.now() - savedNoteRecipientsCacheAt < 60_000) {
    return savedNoteRecipientsCache
  }
  if (savedNoteRecipientsRequest) return savedNoteRecipientsRequest

  const db = getDatabaseInstance()
  if (!db) return []

  savedNoteRecipientsRequest = (async () => {
    try {
      const historyRef = query(ref(db, 'vlic_telemetry/conference_dashboards'), limitToLast(100))
      const latestRef = ref(db, 'vlic_telemetry/latest_conference_dashboard')
      const [historySnapshot, latestSnapshot] = await Promise.all([get(historyRef), get(latestRef)])
      const snapshots: unknown[] = []

      if (historySnapshot.exists()) {
        const history = historySnapshot.val()
        if (history && typeof history === 'object') snapshots.push(...Object.values(history))
      }
      if (latestSnapshot.exists()) snapshots.push(latestSnapshot.val())

      const unique = new Map<string, SavedNoteRecipient>()
      for (const value of snapshots) {
        if (!value || typeof value !== 'object' || !Array.isArray((value as { notes?: unknown }).notes)) continue
        for (const note of (value as { notes: unknown[] }).notes) {
          if (!note || typeof note !== 'object') continue
          const record = note as { destNome?: unknown; destCNPJ?: unknown }
          const nome = typeof record.destNome === 'string' ? record.destNome.trim() : ''
          const cnpj = typeof record.destCNPJ === 'string' ? cleanDigits(record.destCNPJ) : ''
          if (!nome || cnpj.length !== 14) continue
          unique.set(`${normalizeSearch(nome)}:${cnpj}`, { nome, cnpj })
        }
      }

      savedNoteRecipientsCache = Array.from(unique.values())
      savedNoteRecipientsCacheAt = Date.now()
      return savedNoteRecipientsCache
    } catch (error) {
      console.warn('Não foi possível consultar destinatários das notas salvas no Firebase:', error)
      return savedNoteRecipientsCache
    } finally {
      savedNoteRecipientsRequest = null
    }
  })()

  return savedNoteRecipientsRequest
}

export async function resolveSavedNoteDestinatario(
  rawNome?: string,
  rawCnpj?: string,
  sourceText?: string
): Promise<{ nome: string; cnpj: string } | null> {
  const recipients = await getSavedNoteRecipients()
  return matchSavedNoteDestinatario(recipients, rawNome, rawCnpj, sourceText)
}

export function matchSavedNoteDestinatario(
  recipients: SavedNoteRecipient[],
  _rawNome?: string,
  rawCnpj?: string,
  _sourceText?: string
): SavedNoteRecipient | null {
  const cnpj = cleanDigits(rawCnpj)

  if (cnpj.length === 14) {
    const exactCnpjMatch = recipients.find((recipient) => recipient.cnpj === cnpj)
    if (exactCnpjMatch) return exactCnpjMatch
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
