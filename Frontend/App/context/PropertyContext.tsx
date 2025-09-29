// context/PropertyContext.tsx
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const API_URL = "http://10.0.2.2:3000";

export type Property = {
  id: number;
  nome_propriedade: string;
  car_code: string;
  latitude: number;
  longitude: number;
  plus_code: string;
  owner_name?: string; // Mantemos o owner_name opcional
};

type PropertyContextType = {
  properties: Property[];
  isLoading: boolean;
  fetchProperties: () => void;
  deleteProperty: (propertyId: number) => Promise<void>;
  addProperty: (newProperty: Omit<Property, 'id'>) => void;
};

const PropertyContext = createContext<PropertyContextType | null>(null);

export function useProperties() {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error("useProperties deve ser usado dentro de um PropertyProvider");
  }
  return context;
}

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { authToken } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProperties = useCallback(async () => {
    if (!authToken || authToken === 'guest-token') {
      setProperties([]);
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/properties`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setProperties(response.data);
    } catch (error) {
      console.error("Erro ao buscar propriedades no contexto:", error);
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  const deleteProperty = async (propertyId: number) => {
    setProperties(currentProperties =>
      currentProperties.filter(p => p.id !== propertyId)
    );
  };

  const addProperty = (newProperty: any) => {
      // O backend irá gerar o ID, então buscamos a lista atualizada
      fetchProperties();
  }

  useEffect(() => {
    if (authToken) {
      fetchProperties();
    }
  }, [authToken, fetchProperties]);

  const value = {
    properties,
    isLoading,
    fetchProperties,
    deleteProperty,
    addProperty
  };

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}