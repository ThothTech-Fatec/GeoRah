// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      {/* A tela de login é uma rota no nível principal */}
      <Stack.Screen name="login" options={{ headerShown: false }} />
      
      {/* O grupo "(tabs)" é tratado como uma única tela aqui */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}