// backend/services/weatherService.ts
import axios from 'axios';

const API_KEY = process.env.WEATHER_KEY
export interface WeatherAlert {
  type: 'STORM' | 'RAIN_HEAVY' | 'RAIN_LIGHT' | 'CLEAR'; // <--- Adicionei CLEAR
  severity: 'HIGH' | 'MEDIUM' | 'LOW';                   // <--- Adicionei LOW
  title: string;
  description: string;
}

export const getWeatherAlert = async (lat: number, lng: number): Promise<WeatherAlert | null> => {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&lang=pt_br`;
    
    const response = await axios.get(url);
    const weather = response.data;

    if (!weather.weather || weather.weather.length === 0) return null;

    const conditionId = weather.weather[0].id;
    const description = weather.weather[0].description;
    const formattedDesc = description.charAt(0).toUpperCase() + description.slice(1);

    // 1. Tempestades (200-299) -> PERIGO ALTO
    if (conditionId >= 200 && conditionId < 300) {
      return { type: 'STORM', severity: 'HIGH', title: 'Tempestade na Região', description: `Alerta: ${formattedDesc}. Evite estradas de terra.` };
    }

    // 2. Garoa (300-399) -> ALERTA MÉDIO
    if (conditionId >= 300 && conditionId < 400) {
      return { type: 'RAIN_LIGHT', severity: 'MEDIUM', title: 'Piso Escorregadio', description: `Previsão de ${formattedDesc}. Cuidado com lama.` };
    }

    // 3. Chuva (500-599) -> PERIGO ALTO
    if (conditionId >= 500 && conditionId < 600) {
       return { type: 'RAIN_HEAVY', severity: 'HIGH', title: 'Risco de Atoleiro', description: `Chuva ativa (${formattedDesc}). Estradas intransitáveis.` };
    }

    // --- NOVO: CÉU LIMPO / NUVENS (800+) -> SINAL VERDE ---
    if (conditionId >= 800) {
      return {
        type: 'CLEAR',
        severity: 'LOW', // Nível Seguro
        title: 'Tempo Bom',
        description: `Condições favoráveis (${formattedDesc}). Estrada provavelmente seca.`
      };
    }

    return null;

  } catch (error) {
    console.error("Erro ao buscar clima:", error);
    return null;
  }
};