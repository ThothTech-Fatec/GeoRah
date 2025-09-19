// app/(tabs)/index.tsx
import React, { useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, GestureResponderEvent } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, LatLng, MapPressEvent } from 'react-native-maps';
import Constants from 'expo-constants';

const API_KEY = Constants.expoConfig?.extra?.googleApiKey;

export default function MapScreen() {
  const [plusCode, setPlusCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // 1. NOVO ESTADO: para guardar as coordenadas do marcador dinâmico
  const [clickedLocation, setClickedLocation] = useState<LatLng | null>(null);

  const initialCoordinates = {
    latitude: -23.1791,
    longitude: -45.8872,
  };

  const initialRegion = {
    ...initialCoordinates,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  const getPlusCodeFromCoordinates = async (latitude: number, longitude: number) => {
    if (!API_KEY) {
      setPlusCode("Chave de API não encontrada.");
      return;
    }
    setIsLoading(true);
    setPlusCode(null);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.plus_code) {
        setPlusCode(data.plus_code.compound_code || data.plus_code.global_code);
      } else {
        setPlusCode("Não foi possível obter o Plus Code.");
      }
    } catch (error) {
      setPlusCode("Erro de conexão.");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. NOVA FUNÇÃO: para lidar com cliques no mapa
  const handleMapPress = (event: MapPressEvent) => {
    const coords = event.nativeEvent.coordinate;
    
    // Esconde a caixa do Plus Code
    setPlusCode(null);
    
    // Define a localização do novo marcador
    setClickedLocation(coords);
  };

  return (
    <View style={styles.container}>
      {/* 3. Adicionado onPress ao MapView */}
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onPress={handleMapPress}
      >
        {/* Marcador Fixo Original */}
        <Marker
          coordinate={initialCoordinates}
          title="São José dos Campos"
          description="Clique para ver o Plus Code"
          onPress={() => {
            // Limpa o marcador dinâmico ao clicar no fixo
            setClickedLocation(null); 
            getPlusCodeFromCoordinates(initialCoordinates.latitude, initialCoordinates.longitude);
          }}
        />

        {/* 4. NOVO MARCADOR: renderizado apenas se o usuário clicou no mapa */}
        {clickedLocation && (
          <Marker
            coordinate={clickedLocation}
            title="Local Escolhido"
            description="Clique para ver o Plus Code"
            pinColor="blue" // Cor diferente para distinguir
            onPress={() => getPlusCodeFromCoordinates(clickedLocation.latitude, clickedLocation.longitude)}
          />
        )}
      </MapView>
      
      {/* A caixa do Plus Code agora só aparece quando plusCode não for nulo */}
      {plusCode && (
        <View style={styles.plusCodeContainer}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.plusCodeText}>
              {`Plus Code: ${plusCode}`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// Estilos (sem alteração)
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  plusCodeContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  plusCodeText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});