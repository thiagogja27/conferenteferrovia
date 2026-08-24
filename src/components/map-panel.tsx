'use client'

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { type NFEData } from "@/lib/nfe-parser"
import { 
  Map, 
  Pin, 
  PinOff,
  Truck,
  Warehouse,
  Anchor,
  Navigation,
  ArrowRight,
  Info,
  MapPin,
  ExternalLink,
  Loader2,
  Train
} from "lucide-react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface ProcessedFile {
  fileName: string
  nfeData: NFEData | null
}

interface MapPanelProps {
  files: Array<ProcessedFile>
}

interface RoutePoint {
  lat: number
  lng: number
  name: string
  address: string
  type: 'retirada' | 'transbordo' | 'terminal' | 'destinatario'
}

// Lista pré-geocodificada offline de grandes hubs logísticos e de commodities no Brasil
const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number; name: string }> = {
  "CAIAPONIA": { lat: -16.9566, lng: -51.8103, name: "Caiapônia - GO" },
  "RIO VERDE": { lat: -17.7915, lng: -50.9208, name: "Rio Verde - GO" },
  "JATAI": { lat: -17.8814, lng: -51.7144, name: "Jataí - GO" },
  "SAO SIMAO": { lat: -18.9954, lng: -50.6025, name: "São Simão - GO" },
  "UBERABA": { lat: -19.7476, lng: -47.9392, name: "Uberaba - MG" },
  "ARAGUARI": { lat: -18.6475, lng: -48.1873, name: "Araguari - MG" },
  "PEDERNEIRAS": { lat: -22.3524, lng: -48.7758, name: "Pederneiras - SP" },
  "PRADOPOLIS": { lat: -21.3597, lng: -48.0644, name: "Pradópolis - SP" },
  "PRADÓPOLIS": { lat: -21.3597, lng: -48.0644, name: "Pradópolis - SP" },
  "SANTOS": { lat: -23.9618, lng: -46.3322, name: "Santos - SP" },
  "GUARUJA": { lat: -23.9931, lng: -46.2564, name: "Guarujá - SP" },
  "PARANAGUA": { lat: -25.5204, lng: -48.5135, name: "Paranaguá - PR" },
  "SAO PAULO": { lat: -23.5505, lng: -46.6333, name: "São Paulo - SP" },
  "GOIANIA": { lat: -16.6869, lng: -49.2648, name: "Goiânia - GO" },
  "BELO HORIZONTE": { lat: -19.9167, lng: -43.9345, name: "Belo Horizonte - MG" },
  "CURITIBA": { lat: -25.4290, lng: -49.2671, name: "Curitiba - PR" },
  "CUIABA": { lat: -15.6010, lng: -56.0974, name: "Cuiabá - MT" },
  "RONDONOPOLIS": { lat: -16.4673, lng: -54.6358, name: "Rondonópolis - MT" },
  "RONDONÓPOLIS": { lat: -16.4673, lng: -54.6358, name: "Rondonópolis - MT" },
}

export function MapPanel({ files }: MapPanelProps) {
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const layersGroupRef = useRef<L.LayerGroup | null>(null)
  const geocodeCacheRef = useRef<Record<string, [number, number]>>({})

  // Filtra as notas processadas com dados completos
  const filesWithData = files.filter((f) => f.nfeData !== null)
  const activeFile = filesWithData[selectedFileIndex]

  // Geocodificador inteligente: Verificação rápida offline -> extração heurística -> OpenStreetMap Nominatim
  const performGeocoding = async (addressText: string): Promise<[number, number] | null> => {
    if (!addressText || addressText.trim().length < 3) return null

    const textClean = addressText
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .toUpperCase()
      .trim()

    // 1. Verificar cache local em memória
    if (geocodeCacheRef.current[textClean]) {
      return geocodeCacheRef.current[textClean]
    }

    // 2. Verificar correspondência com hubs agribusiness conhecidos offline
    for (const [key, coords] of Object.entries(KNOWN_LOCATIONS)) {
      if (textClean.includes(key)) {
        const value: [number, number] = [coords.lat, coords.lng]
        geocodeCacheRef.current[textClean] = value
        return value
      }
    }

    // 3. Heurística de correspondência de Cidade-Estado (ex: "UBERABA, CEP" ou "CIDADE: UBERABA")
    const cityStateMatch = addressText.match(/([A-ZÀ-Ú\s]{3,30})\s*-\s*(GO|SP|MG|PR|MT|MS|RJ|ES|BA|TO)/i) ||
                           addressText.match(/CIDADE:\s*([A-ZÀ-Ú\s]+)/i)
    if (cityStateMatch) {
      const cityClean = cityStateMatch[1]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
      
      for (const [key, coords] of Object.entries(KNOWN_LOCATIONS)) {
        if (cityClean.includes(key) || key.includes(cityClean)) {
          const value: [number, number] = [coords.lat, coords.lng]
          geocodeCacheRef.current[textClean] = value
          return value
        }
      }
    }

    // 4. Fallback online para OpenStreetMap Nominatim (Filtrando termos ruidosos da nota)
    try {
      let queryClean = addressText
        .replace(/CNPJ:?\s*[\d\.\-\/]+/gi, '')
        .replace(/IE:?\s*\d+/gi, '')
        .replace(/CEP:?\s*[\d\-]+/gi, '')
        .replace(/NPED:?\s*\d+/gi, '')
        .trim()

      if (queryClean.length > 80) {
        // Encurta endereços longos pegando o final, onde costuma estar Cidade/Estado/CEP
        const segments = queryClean.split(',')
        if (segments.length > 1) {
          queryClean = segments.slice(-2).join(',')
        }
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryClean + ", Brasil")}&limit=1`,
        {
          headers: {
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            "User-Agent": "NFe-XML-Geographical-Route-Map-Panel-Applet"
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        if (data && data.length > 0) {
          const result: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)]
          geocodeCacheRef.current[textClean] = result
          return result
        }
      }
    } catch (err) {
      console.warn("Geocodificação online Nominatim falhou para:", addressText, err)
    }

    // 5. Último fallback: Georreferência geral aproximada baseada na Unidade Federativa (UF)
    const stateMatch = addressText.match(/\b(GO|SP|MG|PR|MT|MS|RJ|ES|BA|TO)\b/i)
    if (stateMatch) {
      const uf = stateMatch[1].toUpperCase()
      const ufCapitalCoords: Record<string, [number, number]> = {
        "GO": [-16.6869, -49.2648], // Goiânia
        "SP": [-23.5505, -46.6333], // São Paulo
        "MG": [-19.9167, -43.9345], // Belo Horizonte
        "PR": [-25.4290, -49.2671], // Curitiba
        "MT": [-15.6010, -56.0974], // Cuiabá
        "MS": [-20.4697, -54.6201], // Campo Grande
        "RJ": [-22.9068, -43.1729],
        "BA": [-12.9714, -38.5014]
      }
      if (ufCapitalCoords[uf]) {
        return ufCapitalCoords[uf]
      }
    }

    return null
  }

  // Desmembrar e geocodificar todos os pontos geográficos relevantes do arquivo selecionado
  useEffect(() => {
    if (!activeFile || !activeFile.nfeData) {
      setRoutePoints([])
      return
    }

    const loadPoints = async () => {
      setIsGeocoding(true)
      setErrorMessage(null)
      const nfe = activeFile.nfeData!
      const points: RoutePoint[] = []

      try {
        // 1. Origem / Carregamento / Retirada
        // Se houver local específico de retirada, usamos como início físico, senão os dados do emitente
        const hasRetirada = !!nfe.retirada
        const startName = hasRetirada ? "Local de Retirada (Silagem/Armazém)" : `Emitente: ${nfe.emitente.nome}`
        const startAddr = hasRetirada 
          ? nfe.retirada 
          : `${nfe.emitente.endereco || ""}, ${nfe.emitente.cidade || ""}-${nfe.emitente.uf || ""}`
        
        const startCoords = await performGeocoding(startAddr)
        if (startCoords) {
          points.push({
            lat: startCoords[0],
            lng: startCoords[1],
            name: startName,
            address: startAddr,
            type: "retirada"
          })
        }

        // 2. Ponto de Transbordo (caso ocorra transbordo rodo/ferroviário)
        if (nfe.transbordo) {
          const transCoords = await performGeocoding(nfe.transbordo)
          if (transCoords) {
            points.push({
              lat: transCoords[0],
              lng: transCoords[1],
              name: "Ponto de Transbordo (Terminal de Carga)",
              address: nfe.transbordo,
              type: "transbordo"
            })
          }
        }

        // 3. Porto / Terminal de Entrega (Destino físico)
        if (nfe.terminalEntrega) {
          const termCoords = await performGeocoding(nfe.terminalEntrega)
          if (termCoords) {
            points.push({
              lat: termCoords[0],
              lng: termCoords[1],
              name: "Recinto Alfandegado (Terminal de Exportação)",
              address: nfe.terminalEntrega,
              type: "terminal"
            })
          }
        }

        // 4. Destinatário Comercial (Faturamento / Descarga)
        const destName = `Destinatário: ${nfe.destinatario.nome}`
        const destAddr = `${nfe.destinatario.endereco || ""}, ${nfe.destinatario.cidade || ""}-${nfe.destinatario.uf || ""}`
        
        // Evita duplicar se o terminal de entrega físico já for similar ao destinatário em Santos/etc.
        const matchesTerminal = nfe.terminalEntrega && 
                                (nfe.terminalEntrega.toUpperCase().includes(nfe.destinatario.cidade.toUpperCase()) || 
                                 nfe.destinatario.cidade.toUpperCase().includes("SANTOS"))
        
        // Só exibe ponto de destinatário se for fisicamente diferente ou se não houver terminal de entrega explícito
        if (!nfe.terminalEntrega || !matchesTerminal) {
          const destCoords = await performGeocoding(destAddr)
          if (destCoords) {
            points.push({
              lat: destCoords[0],
              lng: destCoords[1],
              name: destName,
              address: destAddr,
              type: "destinatario"
            })
          }
        }

        if (points.length === 0) {
          setErrorMessage("Não foi possível geocodificar as informações de endereço desta nota fiscal.")
        } else {
          setRoutePoints(points)
        }
      } catch (err) {
        console.error("Erro ao estruturar rota do mapa:", err)
        setErrorMessage("Ocorreu um erro ao carregar os pontos geográficos.")
      } finally {
        setIsGeocoding(false)
      }
    }

    loadPoints()
  }, [activeFile])

  // Inicialização e atualização do mapa geográfico Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return

    let map = mapInstanceRef.current

    try {
      // Inicializar mapa se não existir
      if (!map) {
        // Garantir que o contêiner não tenha uma instância de mapa Leaflet antiga anexada
        if ((mapContainerRef.current as any)._leaflet_id) {
          delete (mapContainerRef.current as any)._leaflet_id
        }

        map = L.map(mapContainerRef.current, {
          center: [-15.7938, -47.8828], // Centro do Brasil
          zoom: 4,
          zoomControl: true,
          attributionControl: true
        })
        mapInstanceRef.current = map

        // Adiciona camada de mapa (OpenStreetMap CartoDB Positron)
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20
        }).addTo(map)

        // Adiciona painel de camadas dinâmicas
        layersGroupRef.current = L.layerGroup().addTo(map)
      }

      const layersGroup = layersGroupRef.current

      if (layersGroup) {
        layersGroup.clearLayers()
      }

      if (routePoints.length > 0 && layersGroup && map) {
        const latLngs: L.LatLngExpression[] = []

        routePoints.forEach((pt) => {
          const position: L.LatLngExpression = [pt.lat, pt.lng]
          latLngs.push(position)

          // Estilos específicos e cores para cada tipo de nó de transporte
          let iconHtml = ""
          let colorTheme = ""
          let badgeChar = ""

          if (pt.type === "retirada") {
            colorTheme = "emerald"
            badgeChar = "O" // Origem
            iconHtml = `
              <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-md bg-emerald-500 text-white font-black text-xs relative pulse-emerald">
                ${badgeChar}
              </div>
            `
          } else if (pt.type === "transbordo") {
            colorTheme = "amber"
            badgeChar = "T" // Transbordo
            iconHtml = `
              <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-md bg-amber-500 text-white font-black text-xs relative pulse-amber">
                ${badgeChar}
              </div>
            `
          } else if (pt.type === "terminal") {
            colorTheme = "indigo"
            badgeChar = "P" // Porto / Terminal
            iconHtml = `
              <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-md bg-indigo-600 text-white font-black text-xs relative pulse-indigo">
                ${badgeChar}
              </div>
            `
          } else {
            colorTheme = "sky"
            badgeChar = "D" // Destinatário
            iconHtml = `
              <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-md bg-sky-500 text-white font-black text-xs relative">
                ${badgeChar}
              </div>
            `
          }

          const customIcon = L.divIcon({
            className: `custom-marker-icon marker-${colorTheme}`,
            html: iconHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
          })

          // Cabeçalho estilizado para os popups
          const badgeClasses: Record<string, string> = {
            retirada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
            transbordo: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
            terminal: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
            destinatario: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
          }

          const popupContent = `
            <div class="p-2 min-w-[200px] text-zinc-800 dark:text-zinc-200">
              <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${badgeClasses[pt.type] || "bg-zinc-100"}">
                ${pt.type === "retirada" ? "Origem / Retirada" : pt.type === "transbordo" ? "Transbordo" : pt.type === "terminal" ? "Terminal de Entrega" : "Destinatário"}
              </span>
              <h4 class="font-bold text-sm mt-1.5 text-zinc-950 dark:text-white leading-tight">${pt.name}</h4>
              <p class="text-xs text-zinc-500 mt-1 leading-snug">${pt.address}</p>
              <div class="text-[10px] text-zinc-400 mt-2 font-mono flex items-center gap-1">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                Coords: ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}
              </div>
            </div>
          `

          L.marker(position, { icon: customIcon })
            .bindPopup(popupContent, { maxWidth: 280 })
            .addTo(layersGroup)
        })

        // Conectar os pontos geográficos em sequência com polilinhas
        if (latLngs.length > 1) {
          L.polyline(latLngs, {
            color: "#4f46e5", // Indigo
            weight: 4,
            opacity: 0.85,
            dashArray: "10, 8",
            lineCap: "round",
            lineJoin: "round"
          }).addTo(layersGroup)

          L.polyline(latLngs, {
            color: "#4f46e5",
            weight: 10,
            opacity: 0.15,
            lineCap: "round",
            lineJoin: "round"
          }).addTo(layersGroup)

          const bounds = L.latLngBounds(latLngs)
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
        } else {
          map.setView(latLngs[0], 10)
        }
      }
    } catch (err) {
      console.error("Erro no mapa Leaflet:", err)
    }

    // Atualiza tamanho do mapa caso contêiner mude
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize()
        } catch {}
      }
    })

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
        } catch {}
        mapInstanceRef.current = null
      }
    }
  }, [routePoints])

  // Função para abrir rota completa no Google Maps em nova aba
  const handleOpenGoogleMapsDir = () => {
    if (routePoints.length < 2) return
    const origin = `${routePoints[0].lat},${routePoints[0].lng}`
    const destination = `${routePoints[routePoints.length - 1].lat},${routePoints[routePoints.length - 1].lng}`
    const waypoints = routePoints.length > 2 
      ? routePoints.slice(1, routePoints.length - 1).map(p => `${p.lat},${p.lng}`).join('|')
      : ""

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`
    }
    window.open(url, '_blank')
  }

  // Visualização amigável de timelines no roadmap esquerdo
  const renderStepIcon = (type: string) => {
    switch (type) {
      case "retirada":
        return <Warehouse className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      case "transbordo":
        return <Train className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      case "terminal":
        return <Anchor className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
      default:
        return <Navigation className="h-4 w-4 text-sky-600 dark:text-sky-400" />
    }
  }

  const stepColors: Record<string, string> = {
    retirada: "bg-emerald-500 border-emerald-200 dark:border-emerald-800",
    transbordo: "bg-amber-500 border-amber-200 dark:border-amber-800",
    terminal: "bg-indigo-600 border-indigo-200 dark:border-indigo-800",
    destinatario: "bg-sky-500 border-sky-200 dark:border-sky-800"
  }

  return (
    <>
      {/* Estilos CSS Inline de suporte às animações e popups Leaflet */}
      <style>{`
        .custom-marker-icon {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: transparent !important;
          border: none !important;
        }
        .pulse-emerald::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.4);
          animation: map-pulse 2s infinite;
          z-index: -1;
        }
        .pulse-amber::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(245, 158, 11, 0.4);
          animation: map-pulse 2s infinite;
          z-index: -1;
        }
        .pulse-indigo::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(79, 70, 229, 0.4);
          animation: map-pulse 2s infinite;
          z-index: -1;
        }
        @keyframes map-pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          padding: 4px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08) !important;
          border: 1px solid rgba(228, 228, 231, 0.8) !important;
        }
        .leaflet-popup-tip {
          box-shadow: 0 4px 10px rgba(0,0,0,0.05) !important;
        }
        .dark .leaflet-popup-content-wrapper {
          background-color: #18181b !important;
          border: 1px solid #27272a !important;
        }
        .dark .leaflet-popup-tip {
          background-color: #18181b !important;
        }
      `}</style>

      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-bold">
                <Map className="h-5 w-5 text-indigo-500" />
                Rastreamento Geográfico da Rota
              </CardTitle>
              <CardDescription>
                Mapeamento visual do escoamento e transbordo multimodal de suas notas fiscais.
              </CardDescription>
            </div>
            {filesWithData.length > 1 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Selecionar Nota:</span>
                <select
                  value={selectedFileIndex}
                  onChange={(e) => setSelectedFileIndex(Number(e.target.value))}
                  className="bg-zinc-100 border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                >
                  {filesWithData.map((file, idx) => (
                    <option key={idx} value={idx}>
                      NF {file.nfeData?.numero || "Sem Nº"} - {file.fileName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filesWithData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center bg-zinc-50/50 dark:bg-zinc-900/10">
              <PinOff className="h-12 w-12 text-zinc-400" />
              <p className="mt-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Ainda não há notas carregadas com endereços estruturados.
              </p>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                Faça o upload de arquivos XML ou converta DANFEs em PDF para analisar os pontos de saída, baldeação e escoamento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Painel lateral: Roadmap & Detalhes da Rota */}
              <div className="lg:col-span-1 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="bg-indigo-50 dark:bg-zinc-900 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded text-xs font-bold font-mono">
                      NF-e {activeFile.nfeData?.numero}
                    </span>
                    <span className="text-[11px] text-zinc-400 truncate flex-1 block">
                      {activeFile.fileName}
                    </span>
                  </div>

                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-1.5">
                    <Navigation className="h-3 w-3" />
                    Fluxo Logístico de Carga
                  </h3>

                  {isGeocoding ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                      <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Calculando rotas geográficas...</p>
                    </div>
                  ) : errorMessage ? (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                      {errorMessage}
                    </div>
                  ) : (
                    <div className="relative pl-5 space-y-6 border-l border-zinc-100 dark:border-zinc-800 ml-2.5">
                      {routePoints.map((pt, idx) => (
                        <div key={idx} className="relative group transition-all">
                          {/* Bullet colorido customizado representativo na linha */}
                          <span className={`absolute -left-7 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white text-[7px] font-bold text-white shadow-xs ${stepColors[pt.type]}`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-xs font-black text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                              {renderStepIcon(pt.type)}
                              {pt.name}
                            </p>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed break-words">
                              {pt.address}
                            </p>
                          </div>
                          {idx < routePoints.length - 1 && (
                            <div className="absolute left-[-21px] top-6 bottom-[-22px] border-l-2 border-dotted border-indigo-200 dark:border-zinc-800 z-0"></div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-850 p-3.5 rounded-xl space-y-3 shrink-0">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span>Os pontos do trajeto são baseados nos campos <b>Retirada</b>, <b>Transbordo</b> e <b>Terminal de Entrega</b> presentes nas observações da NF-e.</span>
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs font-bold gap-2 cursor-pointer border-indigo-100 hover:bg-indigo-50/50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    onClick={handleOpenGoogleMapsDir}
                    disabled={routePoints.length < 2}
                  >
                    Google Maps Completo
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Mapa Geográfico Interativo à direita */}
              <div className="lg:col-span-3 flex flex-col space-y-3 relative">
                <div 
                  ref={mapContainerRef} 
                  className="w-full h-[520px] rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-inner overflow-hidden bg-zinc-50 z-10 dark:bg-zinc-950" 
                />
                
                {/* Legendas Flutuantes do Mapa */}
                <div className="absolute top-4 right-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-lg z-20 flex flex-col gap-2 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 pointer-events-none">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    <span>Origem / Carregamento</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                    <span>Ponto de Transbordo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block animate-pulse"></span>
                    <span>Terminal / Porto</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block"></span>
                    <span>Destinatário Comercial</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-zinc-300" />
                    Provedor de mapas: OpenStreetMap &copy; CARTO
                  </span>
                  <span>{routePoints.length} pontos mapeados nesta rota</span>
                </div>
              </div>

            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
