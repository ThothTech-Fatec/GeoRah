// context/PropertyContext.tsx
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { LatLng } from 'react-native-maps';
import { Alert } from 'react-native';

const API_URL = "http://10.0.2.2:3000";

export type Property = {
  // Boundary PODE ser string (vindo da API) ou LatLng[] (no estado mapProperties) ou null/undefined
  boundary?: string | LatLng[] | object | null;
  id: number;
  nome_propriedade: string;
  car_code: string;
  latitude: number;
  longitude: number;
  plus_code: string | null; // <-- CORRIGIDO: Permite null
  owner_name?: string;
  name?: string;
  title?: string;
  codigo?: string;
  user_id: number;
};

type PropertyContextType = {
  properties: Property[];
  isLoading: boolean;
  fetchProperties: () => void;
  deleteProperty: (propertyId: number) => Promise<void>;
  // CORREÇÃO: Mudado para 'any' para corresponder ao uso (apenas como sinal de refetch)
  addProperty: (newProperty?: any) => void;
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

  // --- CORREÇÃO AQUI ---
  const deleteProperty = async (propertyId: number) => {
    // 1. Atualização Otimista: Remove da UI imediatamente
    const originalProperties = properties;
    setProperties(currentProperties =>
      currentProperties.filter(p => p.id !== propertyId)
    );

    // 2. Envia requisição real ao backend
    if (!authToken || authToken === 'guest-token') return; // Segurança
    try {
      await axios.delete(`${API_URL}/properties/${propertyId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      // Sucesso: A UI já está atualizada.
    } catch (error) {
      console.error("Erro ao excluir propriedade no contexto:", error);
      // 3. Reversão: Se a exclusão falhar, restaura a lista original
      Alert.alert("Erro", "Não foi possível excluir a propriedade. Tentando sincronizar...");
      setProperties(originalProperties); // Reverte a UI
      // fetchProperties(); // Alternativamente, apenas recarregue tudo
    }
  };

  // --- CORREÇÃO AQUI ---
  // A função 'addProperty' é usada apenas como um SINAL para recarregar a lista.
  // O argumento 'newProperty' não é usado. Ajustamos o tipo para 'any'.
  const addProperty = (newProperty?: any) => {
      console.log("addProperty chamado, recarregando propriedades...");
      fetchProperties();
  }

  useEffect(() => {
    if (authToken && authToken !== 'guest-token') {
      fetchProperties();
    } else {
      setProperties([]); // Limpa propriedades se o usuário sair
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