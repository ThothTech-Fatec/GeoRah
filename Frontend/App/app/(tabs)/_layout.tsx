// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { FontAwesome } from '@expo/vector-icons';

export default function TabLayout() {
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

      {/* Aba 2: Perfil */}
      <Tabs.Screen
        name="profile" // Aponta para o arquivo profile.tsx
        options={{
          title: 'Perfil', // Corrigi o título para "Perfil" para corresponder à página
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
} 