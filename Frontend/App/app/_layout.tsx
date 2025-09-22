// app/_layout.tsx
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "../context/AuthContext"; // 1. Importe o AuthProvider

// Componente para proteger as rotas
function RootLayoutNav() {
  const { isLoading } = useAuth();

  // Você pode adicionar uma tela de splash/loading aqui enquanto o token é verificado
  if (isLoading) {
    return null; 
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Cadastro', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    // 2. Envolva o layout com o AuthProvider
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}