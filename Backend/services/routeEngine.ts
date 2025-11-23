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

  // --- NOVO MÉTODO PRINCIPAL: Rota com Alternativas ---
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

    // 2. Rota Alternativa (Penalização)
    let altRoute = null;
    const penalizedLinks: any[] = [];

    // Penaliza a rota principal
    for (let i = 0; i < mainPathNodes.length - 1; i++) {
      const nodeIdA = mainPathNodes[i].id;
      const nodeIdB = mainPathNodes[i+1].id;
      const link = this.graph.getLink(nodeIdA, nodeIdB);
      if (link) {
        link.data.weight *= 5; 
        penalizedLinks.push(link);
      }
    }

    // Tenta achar caminho alternativo
    console.log("🔍 Buscando alternativa..."); // LOG NOVO
    const altPathNodes = this.pathFinder.find(startSnap.nodeId, endSnap.nodeId);
    
    // Restaura pesos
    penalizedLinks.forEach(link => link.data.weight /= 5);

    if (altPathNodes && altPathNodes.length > 0) {
      // Verifica se é diferente
      const isDifferent = altPathNodes.length !== mainPathNodes.length || altPathNodes[Math.floor(altPathNodes.length/2)].id !== mainPathNodes[Math.floor(mainPathNodes.length/2)].id;
      
      if (isDifferent) {
        console.log("🎉 É uma rota diferente!"); // LOG NOVO
        altRoute = this.buildFullPath(altPathNodes, startPin, startSnap, endSnap, endPin);
      } else {
         console.log("⚠️ Alternativa igual à principal (Ignorada)."); // LOG NOVO
      }
    } else {
      console.log("❌ Nenhuma alternativa física encontrada (Grafo desconexo sem a rota principal)."); // LOG NOVO
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