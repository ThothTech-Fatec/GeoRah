// app/(tabs)/_layout.tsx
import { Tabs, useRouter } from "expo-router";
import { FontAwesome } from '@expo/vector-icons';
import { Pressable } from "react-native"; // Importe o Pressable

export default function TabLayout() {
  const router = useRouter(); // Hook para controlar a navegação

  return (
    <Tabs>
      {/* Aba 1: Mapa */}
      <Tabs.Screen
        name="index" // Aponta para o arquivo index.tsx (mapa)
        options={{
          title: 'Mapa',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="map" size={size} color={color} />
          ),
        }}
      />

      {/* Aba 2: Botão de Sair (Logout) */}
      <Tabs.Screen
        name="profile" // Damos um nome fictício, pois não há página real
        options={{
          title: 'Sair',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="sign-out" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}