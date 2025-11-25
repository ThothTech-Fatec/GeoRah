// backend/services/routeEngine.ts
import createGraph from 'ngraph.graph';
import path from 'ngraph.path';
import { getDistance, getCoordKey, getNearestPointOnSegment, formatDistance, estimateDuration } from '../utils/geo';
import RoadModel from '../models/Road';

export class RouteEngine {
  public graph = createGraph();
  private pathFinder: any;
  private isInitialized = false;

  // 1. Carrega dados do Banco e monta o Grafo
  async initialize() {
    if (this.isInitialized) return;
    console.log("🔄 Iniciando construção do Grafo de Rotas...");

    const roads = await RoadModel.find({}); 
    let segmentCount = 0;

    roads.forEach((road: any) => {
      if (!road.geometry || !road.geometry.coordinates) return;

      const lines = road.geometry.type === 'MultiLineString' 
        ? road.geometry.coordinates 
        : [road.geometry.coordinates];

      lines.forEach((line: any[]) => {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = { lng: line[i][0], lat: line[i][1] };
          const p2 = { lng: line[i+1][0], lat: line[i+1][1] };

          const id1 = getCoordKey(p1.lat, p1.lng);
          const id2 = getCoordKey(p2.lat, p2.lng);
          const dist = getDistance(p1.lat, p1.lng, p2.lat, p2.lng);

          this.graph.addNode(id1, { lat: p1.lat, lng: p1.lng });
          this.graph.addNode(id2, { lat: p2.lat, lng: p2.lng });
          this.graph.addLink(id1, id2, { weight: dist });
          this.graph.addLink(id2, id1, { weight: dist });
          
          segmentCount++;
        }
      });
    });

    this.pathFinder = path.aStar(this.graph, {
      distance(fromNode, toNode, link) { return link.data.weight; },
      heuristic(fromNode, toNode) { return getDistance(fromNode.data.lat, fromNode.data.lng, toNode.data.lat, toNode.data.lng); }
    });

    this.isInitialized = true;
    console.log(`✅ Grafo construído com ${this.graph.getNodesCount()} nós e ${segmentCount} segmentos.`);
  }

  // --- LÓGICA DE PROJEÇÃO (SNAP-TO-EDGE) ---

  // Helper: Encontra TODOS os nós num raio (para corrigir o bug de segmentos longos)
  findNearestNodes(lat: number, lng: number, radiusMeters: number = 3000): any[] {
    const candidates: any[] = [];
    
    this.graph.forEachNode((node) => {
      const dist = getDistance(lat, lng, node.data.lat, node.data.lng);
      if (dist <= radiusMeters) { 
        candidates.push({ node, dist });
      }
    });

    return candidates;
  }

  // Método Principal de Busca: Encontra o Ponto na Estrada mais próximo
  findNearestRoadPoint(lat: number, lng: number) {
    // Busca num raio de 3km para garantir que pega pontas de estradas longas
    const candidates = this.findNearestNodes(lat, lng, 3000);
    
    let bestPoint = null;
    let bestDist = Infinity;
    let entryNodeId = null;
    const checkedLinks = new Set(); 

    candidates.forEach((cand) => {
      const node = cand.node;
      
      this.graph.forEachLinkedNode(node.id, (linkedNode, link) => {
         if (checkedLinks.has(link.id)) return;
         checkedLinks.add(link.id);

         const projection = getNearestPointOnSegment(
            lat, lng,
            node.data.lat, node.data.lng,
            linkedNode.data.lat, linkedNode.data.lng
         );

         const dist = getDistance(lat, lng, projection.latitude, projection.longitude);

         if (dist < bestDist) {
            bestDist = dist;
            bestPoint = projection;
            
            const distToNode = getDistance(projection.latitude, projection.longitude, node.data.lat, node.data.lng);
            const distToLinked = getDistance(projection.latitude, projection.longitude, linkedNode.data.lat, linkedNode.data.lng);
            entryNodeId = distToNode < distToLinked ? node.id : linkedNode.id;
         }
      });
    });

    if (bestDist > 5000 || !bestPoint) return null; 

    return { point: bestPoint, nodeId: entryNodeId };
  }

  // Helper Privado: Monta o objeto de rota com "Stitching" (Costura) e Metadados
  private buildFullPath(pathNodes: any[], startPin: any, startSnap: any, endSnap: any, endPin: any) {
    if (!pathNodes || pathNodes.length === 0) return null;

    const roadPath = pathNodes.map((node: any) => ({
      latitude: node.data.lat,
      longitude: node.data.lng
    })); 

    // O ngraph retorna FIM -> INICIO. Precisamos inverter.
    const orderedRoadPath = roadPath.reverse();

    // Monta coordenadas visuais (Pino -> Snap -> Estrada -> Snap -> Pino)
    const fullPathCoords = [
      startPin,
      startSnap.point,
      ...orderedRoadPath,
      endSnap.point,
      endPin
    ];

    // Calcula distância total
    let totalDist = 0;
    for(let i=0; i<fullPathCoords.length-1; i++) {
      totalDist += getDistance(
        fullPathCoords[i].latitude, fullPathCoords[i].longitude,
        fullPathCoords[i+1].latitude, fullPathCoords[i+1].longitude
      );
    }

    return {
      path: fullPathCoords,
      distance: totalDist,
      formattedDistance: formatDistance(totalDist),
      duration: estimateDuration(totalDist)
    };
  }

calculateRouteWithAlternatives(startLat: number, startLng: number, endLat: number, endLng: number) {
    if (!this.isInitialized) throw new Error("RouteEngine não inicializado");

    const startSnap = this.findNearestRoadPoint(startLat, startLng);
    const endSnap = this.findNearestRoadPoint(endLat, endLng);

    if (!startSnap || !endSnap) throw new Error("Estrada não encontrada próxima aos pontos.");

    const startPin = { latitude: startLat, longitude: startLng };
    const endPin = { latitude: endLat, longitude: endLng };

    // 1. Rota Principal
    const mainPathNodes = this.pathFinder.find(startSnap.nodeId, endSnap.nodeId);
    const mainRoute = this.buildFullPath(mainPathNodes, startPin, startSnap, endSnap, endPin);

    if (!mainRoute) return null;

    // 2. Busca Alternativa: ESTRATÉGIA DE BLOQUEIO DE NÓS (FORÇA BRUTA)
    let altRoute = null;
    const totalNodes = mainPathNodes.length;

    // Vamos tentar bloquear a estrada em 5 pontos estratégicos diferentes ao longo da rota
    // Ex: Se a rota tem 1000 nós, tentamos bloquear o nó 150, 300, 500, 700, 850.
    const checkpoints = [0.15, 0.30, 0.50, 0.70, 0.85]; 

    console.log(`🛡️ Iniciando busca de alternativa via Bloqueio de Nós...`);

    for (const percent of checkpoints) {
        if (altRoute) break; // Se já achou, para.

        const indexToBan = Math.floor(totalNodes * percent);
        const nodeToBan = mainPathNodes[indexToBan];
        
        // Guarda links originais para restaurar
        const modifiedLinks: { link: any, originalWeight: number }[] = [];

        // --- O BLOQUEIO ---
        // Aumentamos o peso para INFINITO (na prática, um número absurdo)
        // Isso obriga o algoritmo a não passar por esse ponto específico.
        this.graph.forEachLinkedNode(nodeToBan.id, (linkedNode, link) => {
            modifiedLinks.push({ link: link, originalWeight: link.data.weight });
            link.data.weight = 100000000; // 100 Milhões (Bloqueio Virtual)
        });

        // Tenta calcular a rota com esse buraco na estrada
        const altPathNodes = this.pathFinder.find(startSnap.nodeId, endSnap.nodeId);

        // Restaura o mapa IMEDIATAMENTE
        modifiedLinks.forEach(item => { item.link.data.weight = item.originalWeight; });

        // Verifica se achou um caminho
        if (altPathNodes && altPathNodes.length > 0) {
            // Verifica similaridade (Jaccard)
            const mainSet = new Set(mainPathNodes.map((n: any) => n.id));
            const altSet = new Set(altPathNodes.map((n: any) => n.id));
            let intersectionCount = 0;
            altSet.forEach(id => { if (mainSet.has(id)) intersectionCount++; });

            const similarity = intersectionCount / Math.max(mainSet.size, altSet.size);
            
            console.log(`💣 Bloqueio em ${(percent*100).toFixed(0)}%: Similaridade ${(similarity*100).toFixed(1)}%`);

            // ACEITA QUALQUER COISA DIFERENTE DA PRINCIPAL
            // Se mudou 1 rua (99.9% igual), a gente aceita.
            if (similarity < 0.999) {
                const potentialRoute = this.buildFullPath(altPathNodes, startPin, startSnap, endSnap, endPin);
                
                // CORREÇÃO AQUI: Adicionado 'potentialRoute &&'
                if (potentialRoute && potentialRoute.distance < mainRoute.distance * 5) {
                    altRoute = potentialRoute;
                    console.log(`✅ Alternativa encontrada bloqueando o nó ${indexToBan}!`);
                }
            }
        }
    }

    if (!altRoute) {
        console.log("💀 IMPOSSÍVEL: Mesmo bloqueando a estrada, não há outro caminho físico.");
    }

    return {
      main: mainRoute,
      alternative: altRoute 
    };
  }

  // Wrapper para manter compatibilidade, se necessário
  calculateRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
    const result = this.calculateRouteWithAlternatives(startLat, startLng, endLat, endLng);
    return result ? result.main.path : null;
  }
}

export const routeEngine = new RouteEngine();