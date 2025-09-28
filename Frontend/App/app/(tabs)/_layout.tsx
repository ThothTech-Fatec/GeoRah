// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { FontAwesome } from '@expo/vector-icons';
import { MapProvider } from '../../context/MapContext';
import { PropertyProvider } from '../../context/PropertyContext'; // 1. Importe

export default function TabLayout() {
  return (
    <MapProvider>
      <PropertyProvider>
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
          
          <Tabs.Screen
            name="properties" // Aponta para o novo arquivo properties.tsx
            options={{
              title: 'Propriedades',
              headerShown: false,
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="list" size={size} color={color} />
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
      </PropertyProvider>
    </MapProvider>
  );
} 