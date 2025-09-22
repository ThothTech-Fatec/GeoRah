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
    await SecureStore.setItemAsync('authToken', token);
    setAuthToken(token);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('authToken');
    setAuthToken(null);
  };

  const value = {
    login,
    logout,
    authToken,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}