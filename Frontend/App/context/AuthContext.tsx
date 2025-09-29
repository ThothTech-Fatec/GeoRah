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
          if (token === 'guest-token') setIsGuest(true);
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
    // Não faça nada enquanto o token ainda está sendo carregado
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (authToken && !inAuthGroup) {
      // Se o usuário tem um token (acabou de logar) mas NÃO está na área logada,
      // navegue para a tela principal.
      router.replace('/(tabs)');
    } else if (!authToken && inAuthGroup) {
      // Se o usuário NÃO tem um token (acabou de fazer logout) mas está na área logada,
      // navegue para o login.
      router.replace('/login');
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