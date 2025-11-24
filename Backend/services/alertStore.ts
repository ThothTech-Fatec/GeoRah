import { getDistance } from '../utils/geo';

export type AlertType = 
  | 'ANIMAL'          
  | 'OBSTACLE'        
  | 'BROKEN_VEHICLE'  
  | 'ACCIDENT'        
  | 'CONSTRUCTION'    
  | 'BLOCKED';        

export interface RoadAlert {
  id: string;
  lat: number;
  lng: number;
  type: AlertType;
  timestamp: number; 
}

// Configurações
const ALERT_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutos
const MIN_DISTANCE_METERS = 300; // <--- Distância mínima para evitar spam (300m)

class AlertStore {
  private alerts: RoadAlert[] = [];

  constructor() {
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  // --- NOVO MÉTODO: Verifica se já existe alerta igual por perto ---
  hasNearbyAlert(lat: number, lng: number, type: AlertType): boolean {
    return this.alerts.some(alert => {
      // 1. Verifica se é do mesmo tipo (ex: não impede de marcar ACIDENTE perto de OBRAS)
      if (alert.type !== type) return false;

      // 2. Calcula distância
      const dist = getDistance(lat, lng, alert.lat, alert.lng);
      
      // 3. Retorna true se for menor que o limite
      return dist < MIN_DISTANCE_METERS;
    });
  }

  addAlert(lat: number, lng: number, type: AlertType): RoadAlert {
    const newAlert: RoadAlert = {
      id: Math.random().toString(36).substr(2, 9),
      lat,
      lng,
      type,
      timestamp: Date.now(),
    };
    
    this.alerts.push(newAlert);
    console.log(`⚠️ Novo Alerta Registrado: ${type} em [${lat}, ${lng}]`);
    return newAlert;
  }

  getNearbyAlerts(lat: number, lng: number, radiusKm: number = 50): RoadAlert[] {
    const range = 0.5; 
    return this.alerts.filter(a => 
      Math.abs(a.lat - lat) < range && 
      Math.abs(a.lng - lng) < range
    );
  }

  private cleanup() {
    const now = Date.now();
    this.alerts = this.alerts.filter(a => (now - a.timestamp) < ALERT_EXPIRATION_MS);
  }
}

export const alertStore = new AlertStore();