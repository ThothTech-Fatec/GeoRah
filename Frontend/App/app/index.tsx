// app/index.tsx
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const { authToken, isLoading } = useAuth();

  // 1. Enquanto o AuthContext está a verificar o token, mostramos uma tela de carregamento.
  //    Isso "segura" a navegação e evita o "flash" da tela errada.
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 2. Se o carregamento terminou e o utilizador ESTÁ logado (tem um token),
  //    redirecionamos para a tela principal (mapa).
  if (authToken) {
    return <Redirect href="/(tabs)" />;
  }

  // 3. Se o carregamento terminou e o utilizador NÃO está logado,
  //    redirecionamos para a tela de login.
  return <Redirect href="/login" />;
}