// context/MapContext.tsx
import React, { createContext, useState, useContext } from 'react';
import { LatLng } from 'react-native-maps';

// Define o que nosso contexto irá fornecer
type MapContextType = {
  locationToFocus: LatLng | null;
  focusOnLocation: (location: LatLng) => void;
  clearLocationToFocus: () => void; // <-- ADICIONE ISTO
};

const MapContext = createContext<MapContextType | null>(null);

// Hook customizado para usar o contexto facilmente
export function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMap deve ser usado dentro de um MapProvider");
  }
  return context;
}

// Provedor do Contexto
export function MapProvider({ children }: { children: React.ReactNode }) {
  const [locationToFocus, setLocationToFocus] = useState<LatLng | null>(null);

  const focusOnLocation = (location: LatLng) => {
    setLocationToFocus(location);
  };

  const clearLocationToFocus = () => { // <-- ADICIONE ISTO
    setLocationToFocus(null);
  };

  const value = {
    locationToFocus,
    focusOnLocation,
    clearLocationToFocus, // <-- ADICIONE ISTO
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}