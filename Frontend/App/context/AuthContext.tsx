// app/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';

const AuthContext = createContext<any>(null);

// Hook customizado para usar o contexto de autenticação facilmente
export function useAuth() {
  return useContext(AuthContext);
}

// Provedor do Contexto
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false); // 1. NOVO ESTADO
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const loadAuthToken = async () => {
      try {
        const token = await SecureStore.getItemAsync('authToken');
        if (token) {
          setAuthToken(token);
        }
      } catch (e) {
        console.error("Erro ao carregar o token", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadAuthToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (!authToken && inAuthGroup) {
      // Se não há token e o usuário está na área logada, redireciona para o login
      router.replace('/login');
    } else if (authToken && !inAuthGroup) {
      // Se há um token e o usuário está fora da área logada (ex: na tela de login),
      // redireciona para a tela principal
      router.replace('/(tabs)');
    }
  }, [authToken, segments, isLoading, router]);

  const login = async (token: string) => {
    // 2. Lógica para diferenciar o login
    if (token === 'guest-token') {
      setIsGuest(true);
    } else {
      setIsGuest(false);
      await SecureStore.setItemAsync('authToken', token);
    }
    setAuthToken(token);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('authToken');
    setAuthToken(null);
    setIsGuest(false); // 3. Limpa o estado de convidado no logout
  };

  const value = {
    login,
    logout,
    authToken,
    isGuest, // 4. Exponha o estado de convidado
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}