// app/(tabs)/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Modal, Pressable, TextInput, Alert } from 'react-native';
// Usando MapView normal + componentes
import MapView, { Marker, PROVIDER_GOOGLE, LatLng, MapPressEvent, Polygon, Callout, Region } from 'react-native-maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
// Importa Property (assumindo que plus_code é 'string | null' e boundary é 'any')
import { useProperties, Property } from '../../context/PropertyContext';
import { useMap } from '../../context/MapContext';
import { useIsFocused } from '@react-navigation/native';
import axios from 'axios';

const API_URL = "http://10.0.2.2:3000"; // Ou IP correto
const API_KEY = Constants.expoConfig?.extra?.googleApiKey; // Garanta que está configurada

// --- NÍVEIS DE ZOOM ---
// Nível de zoom (latitudeDelta) para mostrar polígonos
const POLYGON_VISIBILITY_ZOOM_THRESHOLD = 0.05; // Mais perto
// Nível de zoom para mostrar MARCADORES
const MARKER_VISIBILITY_ZOOM_THRESHOLD = 0.4; // Mais afastado (mostra antes dos polígonos)

// --- Função Auxiliar para verificar visibilidade ---
const isMarkerVisible = (markerCoords: LatLng, region: Region | null): boolean => {
  if (!region || !markerCoords || typeof markerCoords.latitude !== 'number' || typeof markerCoords.longitude !== 'number') return false;
  const minLat = region.latitude - region.latitudeDelta, maxLat = region.latitude + region.latitudeDelta;
  const minLng = region.longitude - region.longitudeDelta, maxLng = region.longitude + region.longitudeDelta;
  // Aumentei a margem para carregar marcadores/polígonos um pouco fora da tela
  return (
    markerCoords.latitude >= minLat && markerCoords.latitude <= maxLat &&
    markerCoords.longitude >= minLng && markerCoords.longitude <= maxLng
  );
};

// --- Função Auxiliar para parsear o boundary ---
// Chamada "Just-in-Time" (só quando for renderizar)
const parseBoundaryToLatLng = (boundary: any, car_code: string): LatLng[] => {
  if (!boundary) return [];
  let parsedBoundary: LatLng[] = [];
  
  // Se boundary vier como string JSON de [{"latitude":...}]
  if (typeof boundary === 'string') {
    try {
      const parsed = JSON.parse(boundary);
      if (Array.isArray(parsed)) {
        parsedBoundary = parsed.filter(p => typeof p?.latitude === 'number' && typeof p?.longitude === 'number')
                               .map(p => ({ latitude: p.latitude, longitude: p.longitude }));
      }
    } catch (e) { console.error(`Error parsing boundary ${car_code}:`, e); }
  } 
  // Se boundary vier como GeoJSON (do seu código de salvar)
  else if (boundary && boundary.type && boundary.coordinates) {
    try {
      let coordinateList: number[][] | null = null;
      if (boundary.type === 'MultiPolygon' && boundary.coordinates[0]?.[0]) {
        coordinateList = boundary.coordinates[0][0];
      } else if (boundary.type === 'Polygon' && boundary.coordinates[0]) {
        coordinateList = boundary.coordinates[0];
      }
      if (coordinateList) {
        parsedBoundary = coordinateList.map((coords: number[]) => {
          if (Array.isArray(coords) && coords.length >= 2) {
            return { latitude: coords[1], longitude: coords[0] }; // GeoJSON é [lng, lat]
          } return null;
        }).filter(Boolean) as LatLng[];
      }
    } catch (e) { console.error("Error converting GeoJSON object:", e); }
  }
  // Se já for um array LatLng[] (do contexto)
  else if (Array.isArray(boundary)) {
     parsedBoundary = boundary.filter(p => typeof p?.latitude === 'number' && typeof p?.longitude === 'number')
                               .map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }
  return parsedBoundary;
};


export default function MapScreen() {
  console.log("--- MapScreen RENDERED ---");

  // --- Estados ---
  const { authToken, isGuest } = useAuth();
  const { properties: userProperties, addProperty, fetchProperties } = useProperties();
  const { locationToFocus } = useMap();
  const mapViewRef = useRef<MapView>(null);
  const isFocused = useIsFocused();
  // mapProperties guarda dados BRUTOS (boundary é string JSON ou GeoJSON object)
  const [mapProperties, setMapProperties] = useState<Property[]>([]);
  // Cache para todas as propriedades públicas
  const [publicPropertiesCache, setPublicPropertiesCache] = useState<Property[]>([]);
  // Estado do filtro
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');
  
  const [plusCode, setPlusCode] = useState<string | null>(null);
  const [selectedMarkerPlusCode, setSelectedMarkerPlusCode] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPlusCode, setIsFetchingPlusCode] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<LatLng | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [nomePropriedade, setNomePropriedade] = useState("");
  const [codigoCar, setCodigoCar] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<LatLng[]>([]);
  
  const initialRegion: Region = { latitude: -21.888341, longitude: -51.499488, latitudeDelta: 0.8822, longitudeDelta: 0.5821 };
  const [currentRegion, setCurrentRegion] = useState<Region | null>(initialRegion);

  // --- Efeitos ---

  // Busca GPS inicial
  useEffect(() => {
    (async () => {
      console.log("Requesting location permissions...");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Permita o uso da localização para centralizar o mapa.');
        console.log("Location permission denied."); return;
      }
      console.log("Location permission granted.");
      try {
        const location = await Location.getCurrentPositionAsync({});
        const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        console.log("User location:", coords); setUserLocation(coords);
        if (mapViewRef.current) {
          console.log("Animating map to user location...");
          mapViewRef.current.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 1000);
        }
      } catch (error) { console.error("Error getting location:", error); }
    })();
  }, []);

  // Busca/Processa propriedades (SÓ dados básicos, SEM processar boundary)
  useEffect(() => {
    console.log("--- useEffect DATA Processing (Basic) ---");
    console.log({ isFocused, isGuest, userPropertiesLength: userProperties?.length, filterMode });

    // Função SÍNCRONA: Apenas garante lat/lng numérico e preserva owner_name
    const processBasicData = (properties: Property[]): Property[] => {
      if (!properties || properties.length === 0) return [];
      return properties.map(prop => ({
        ...prop, // Mantém owner_name e boundary (bruto)
        latitude: Number(prop.latitude) || 0,
        longitude: Number(prop.longitude) || 0,
      }));
    };

    // Busca propriedades públicas (só se a cache estiver vazia)
    const fetchAllPublicProperties = async () => {
      if (publicPropertiesCache.length > 0) {
        console.log("Using cached public properties");
        setMapProperties(publicPropertiesCache); // Usa a cache
        return;
      }
      
      console.log("Fetching public properties..."); setIsLoading(true);
      try {
        const response = await axios.get(`${API_URL}/properties/public`);
        console.log("API Response Received:", response.data?.length ?? 0, "properties");
        if (response.data && Array.isArray(response.data)) {
           const processedData = processBasicData(response.data);
           setPublicPropertiesCache(processedData as any); // Salva na cache
           setMapProperties(processedData as any); // Define para exibição
        } else { setPublicPropertiesCache([]); setMapProperties([]); }
      } catch (error) {
        console.error("Erro ao buscar propriedades públicas:", error); setMapProperties([]);
      } finally { setIsLoading(false); }
    };

    if (isFocused) {
      if (isGuest) {
        setFilterMode('all'); // Força 'all' para convidados
        fetchAllPublicProperties();
      } else {
        // Usuário Logado
        if (filterMode === 'all') {
          fetchAllPublicProperties(); // Busca/usa cache de todas
        } else { // filterMode === 'mine'
          const processedUserData = processBasicData(userProperties); // Processa só as do contexto
          setMapProperties(processedUserData as any);
        }
      }
    }
  }, [isGuest, userProperties, isFocused, filterMode]); // Re-roda se o filtro mudar

  // Foca mapa
  useEffect(() => { /* ... (código igual anterior) ... */ }, [locationToFocus, isFocused]);

  // --- Funções Handler ---
  const getPlusCodeFromCoordinates = async (latitude: number, longitude: number): Promise<string | null> => {
  
  if (!API_KEY) {
    Alert.alert("Erro", "Chave de API não encontrada.");
    return null; // (Correto)
  }

  let foundPlusCode: string | null = null; // Use uma variável

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.plus_code) {
      foundPlusCode = data.plus_code.compound_code || data.plus_code.global_code;
    } else {
      Alert.alert("Erro", "Não foi possível obter o Plus Code para este local.");
      // 'foundPlusCode' continua 'null' (Correto)
    }
  } catch (error) {
    Alert.alert("Erro", "Erro de conexão ao buscar o Plus Code.");
    // 'foundPlusCode' continua 'null' (Correto)
  }

  // CORREÇÃO: Garante que a função SEMPRE retorna a variável no final.
  return foundPlusCode;
};

  const handleMapPress = (event: MapPressEvent) => { /* ... (código igual anterior) ... */ };
  const handleMarkerPress = async (property: Property) => { /* ... (código igual anterior) ... */ };
  
  // Salvar Nova Propriedade (Envia GeoJSON)
  const handleSaveProperty = async () => {
     console.log("Attempting to save property...");
     if (!nomePropriedade || !codigoCar) { Alert.alert("Erro", "Preencha nome e código CAR."); return; }
     if (!clickedLocation || !plusCode || plusCode.startsWith("Erro")) { Alert.alert("Erro", "Localização ou Plus Code inválidos."); return; }
     
     // Converte pontos desenhados (LatLng[]) para GeoJSON [lng, lat]
     const boundaryToSend = polygonPoints.length > 2 
        ? { type: "Polygon", coordinates: [[...polygonPoints, polygonPoints[0]].map(p => [p.longitude, p.latitude])] }
        : null;

     const propertyData = {
       nome_propriedade: nomePropriedade, car_code: codigoCar,
       latitude: clickedLocation.latitude, longitude: clickedLocation.longitude,
       plus_code: plusCode, 
       boundary: boundaryToSend, // Envia GeoJSON
     };
     
     console.log("Saving property data (GeoJSON boundary):", propertyData); setIsLoading(true);
     try {
       const response = await axios.post(`${API_URL}/properties`, propertyData, { headers: { Authorization: `Bearer ${authToken}` }});
       console.log("Save successful:", response.data);
       if (response.data.newProperty) { addProperty(response.data.newProperty); }
       else { fetchProperties(); } // Recarrega o contexto
       Alert.alert("Sucesso!", "Propriedade registrada.");
       setIsModalVisible(false); setClickedLocation(null); setNomePropriedade(""); setCodigoCar(""); setPlusCode(null); setPolygonPoints([]); setIsDrawing(false);
     } catch (error) {
       console.error("Error saving property:", error);
       if (axios.isAxiosError(error) && error.response) { Alert.alert("Erro ao Salvar", error.response.data.message || `Erro ${error.response.status}`);}
       else { Alert.alert("Erro", "Não foi possível conectar.");}
     } finally { setIsLoading(false); }
  };

  // Funções de Desenho
  const startDrawing = () => { /* ... (código igual anterior) ... */ };
  const finishDrawing = async () => { /* ... (código igual anterior) ... */ };
  const cancelDrawing = () => { /* ... (código igual anterior) ... */ };
  const handleCancelConfirmation = () => { /* ... (código igual anterior) ... */ };

  // ----- Renderização -----
  return (
    <View style={styles.container}>
      <MapView
        ref={mapViewRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onPress={handleMapPress}
        onRegionChangeComplete={(region) => setCurrentRegion(region)} // Atualiza região
      >
        {/* Marcador azul (nova propriedade) */}
        {clickedLocation && !isDrawing && (
           <Marker
             coordinate={clickedLocation} pinColor="blue" draggable title="Novo Local" description={plusCode || "Arraste"}
             onDragEnd={(e) => {
               const newCoords = e.nativeEvent.coordinate;
               setShowConfirmation(true); setClickedLocation(newCoords); setPlusCode(null);
               getPlusCodeFromCoordinates(newCoords.latitude, newCoords.longitude).then(setPlusCode);
             }}
           />
        )}

        {/* Marcadores e Polígonos (Filtrados por ZOOM e VIEWPORT) */}
        {/* CORREÇÃO: Adicionada condição de zoom para os MARCADORES */}
        {currentRegion && currentRegion.latitudeDelta < MARKER_VISIBILITY_ZOOM_THRESHOLD && (
          mapProperties
           // 1. Filtra apenas os que estão visíveis
           .filter(prop => isMarkerVisible({ latitude: prop.latitude, longitude: prop.longitude }, currentRegion))
           // 2. Mapeia SOMENTE os visíveis
           .map((prop) => {
              const propId = prop.id ?? prop.car_code ?? `${prop.latitude}_${prop.longitude}`;
              const coord: LatLng = { latitude: prop.latitude, longitude: prop.longitude };
              const isSelected = selectedMarkerId === propId;
              // Condição de zoom para polígonos (mais perto)
              const shouldRenderPolygon = currentRegion.latitudeDelta < POLYGON_VISIBILITY_ZOOM_THRESHOLD;
              
              // 3. Processa o boundary SÓ AGORA, se for renderizar
              // Passa o prop.boundary (string JSON ou GeoJSON obj) e o car_code (para logs de erro)
              const polygonCoords = shouldRenderPolygon ? parseBoundaryToLatLng(prop.boundary, String(prop.car_code)) : [];

              if (isNaN(coord.latitude) || isNaN(coord.longitude)) return null;

              return (
                 <React.Fragment key={propId}>
                   <Marker
                     identifier={propId.toString()}
                     coordinate={coord}
                     pinColor="green"
                     onPress={(e) => { e.stopPropagation(); handleMarkerPress(prop); }}
                     onDeselect={() => { if (isSelected) { setSelectedMarkerId(null); setSelectedMarkerPlusCode(null); } }}
                   >
                     <Callout tooltip={false} onPress={(e) => e.stopPropagation()}>
                       <View style={styles.calloutContainer}>
                         <Text style={styles.calloutTitle} numberOfLines={1}>{String(prop.nome_propriedade ?? "Propriedade")}</Text>
                         {/* CORREÇÃO: owner_name é preservado e renderizado */}
                         {isGuest && prop.owner_name && ( <Text style={styles.calloutText}>Proprietário: {String(prop.owner_name)}</Text> )}
                         <Text style={styles.calloutText}>CAR: {String(prop.car_code ?? 'N/A')}</Text>
                         <Text style={styles.calloutText}>
                            Plus Code: {isSelected ? (isFetchingPlusCode ? 'Buscando...' : String(selectedMarkerPlusCode ?? 'Clique no pino')) : (String(prop.plus_code || 'Clique no pino'))}
                         </Text>
                       </View>
                     </Callout>
                   </Marker>
                   {/* 4. Renderiza o polígono se as condições forem atendidas */}
                   {shouldRenderPolygon && polygonCoords.length > 0 && (
                     <Polygon
                       coordinates={polygonCoords} // Usa o array recém-parseado
                       strokeColor="rgba(0, 100, 0, 0.5)"
                       fillColor="rgba(0, 100, 0, 0.15)"
                       strokeWidth={1.5}
                       tappable
                       onPress={(e) => { e.stopPropagation(); handleMarkerPress(prop); }}
                     />
                   )}
                 </React.Fragment>
              );
           })
        )} 
        {/* Fim do bloco condicional de marcadores/polígonos */}

         {/* Polígono sendo desenhado */}
         {polygonPoints.length > 0 && ( <Polygon coordinates={polygonPoints} strokeColor="red" fillColor="rgba(255,0,0,0.2)" strokeWidth={3} /> )}
      </MapView>

      {/* Botão GPS */}
      <Pressable style={styles.gpsButton} onPress={() => {
          if (userLocation && mapViewRef.current) {
             mapViewRef.current.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 1000);
           } else { Alert.alert("Localização", "Não foi possível obter sua localização."); }
      }}>
        <Text style={styles.gpsButtonText}>📍</Text>
      </Pressable>

      {/* --- NOVO: Botões de Filtro --- */}
      {!isGuest && (
        <View style={styles.filterContainer}>
          <Pressable
            style={[styles.filterButton, filterMode === 'all' && styles.filterButtonActive]}
            onPress={() => setFilterMode('all')}
          >
            <Text style={styles.filterButtonText}>Todas</Text>
          </Pressable>
          <Pressable
            style={[styles.filterButton, filterMode === 'mine' && styles.filterButtonActive]}
            onPress={() => setFilterMode('mine')}
          >
            <Text style={styles.filterButtonText}>Minhas</Text>
          </Pressable>
        </View>
      )}

      {/* Botões de Desenho */}
      <View style={styles.drawingControls}>
         {!isDrawing ? (
           <Pressable style={[styles.button, styles.saveButton]} onPress={startDrawing} disabled={isGuest}>
             <Text style={styles.buttonText}>Delimitar Área</Text>
           </Pressable>
         ) : (
           <>
             {polygonPoints.length > 2 && (
                <Pressable style={[styles.button, styles.saveButton]} onPress={finishDrawing}>
                  <Text style={styles.buttonText}>Finalizar</Text>
                </Pressable>
              )}
             <Pressable style={[styles.button, styles.cancelButton]} onPress={cancelDrawing}>
               <Text style={styles.buttonText}>Cancelar</Text>
             </Pressable>
           </>
         )}
       </View>

      {/* Modal */}
      <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={() => {setIsModalVisible(false); setClickedLocation(null); setPolygonPoints([]);}}>
          <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Registar Propriedade</Text>
                  <Text style={styles.plusCodeText}>Plus Code: {String(plusCode || 'N/A')}</Text>
                  <TextInput style={styles.input} placeholder="Nome da Propriedade" value={nomePropriedade} onChangeText={setNomePropriedade} />
                  <TextInput style={styles.input} placeholder="Código CAR" value={codigoCar} onChangeText={setCodigoCar} />
                  <Pressable style={[styles.button, { backgroundColor: '#17a2b8', width: '100%', marginBottom: 15 }]} onPress={() => { setIsModalVisible(false); startDrawing(); }}>
                      <Text style={styles.buttonText}>{polygonPoints.length > 0 ? 'Redesenhar Área' : 'Delimitar Área no Mapa'}</Text>
                  </Pressable>
                  {polygonPoints.length > 2 && <Text style={{marginBottom: 10, fontSize: 12}}>Área delimitada.</Text>}
                  <View style={styles.buttonContainer}>
                      <Pressable style={[styles.button, styles.cancelButton]} onPress={() => { setIsModalVisible(false); setClickedLocation(null); setPolygonPoints([]); }}>
                          <Text style={styles.buttonText}>Cancelar</Text>
                      </Pressable>
                      <Pressable style={[styles.button, styles.saveButton]} onPress={handleSaveProperty} disabled={isLoading}>
                          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Salvar</Text>}
                      </Pressable>
                  </View>
              </View>
          </View>
      </Modal>

      {/* Caixa de Confirmação */}
      {showConfirmation && clickedLocation && !isDrawing && (
        <View style={styles.confirmationContainer}>
          <Text style={styles.confirmationText}>Marcar este local ({String(plusCode || 'buscando...')})?</Text>
          <View style={styles.confirmationButtonContainer}>
            <Pressable style={[styles.confirmationButton, styles.cancelButton]} onPress={handleCancelConfirmation}>
              <Text style={styles.buttonText}>Não</Text>
            </Pressable>
            <Pressable style={[styles.confirmationButton, styles.saveButton]} onPress={async () => {
              setShowConfirmation(false);
              if (plusCode && !plusCode.startsWith("Erro")) { setIsModalVisible(true); }
              else if (clickedLocation){
                 setIsLoading(true);
                 const foundPlusCode = await getPlusCodeFromCoordinates(clickedLocation.latitude, clickedLocation.longitude);
                 setIsLoading(false);
                 if (foundPlusCode && !foundPlusCode.startsWith("Erro")) { setPlusCode(foundPlusCode); setIsModalVisible(true); }
                 else { setClickedLocation(null); Alert.alert("Erro", "Não foi possível obter Plus Code."); }
              }
            }} disabled={isLoading || isFetchingPlusCode}>
              {(isLoading || isFetchingPlusCode) ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sim</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text>Carregando...</Text>
        </View>
      )}
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { width: "90%", backgroundColor: "white", borderRadius: 10, padding: 20, alignItems: "center" },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  plusCodeText: { fontSize: 14, color: "#666", marginBottom: 15, fontWeight: '500' },
  input: { width: "100%", height: 50, borderColor: "#ccc", borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 10, backgroundColor: "#f8f8f8", fontSize: 16 },
  buttonContainer: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 10 },
  button: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, alignItems: "center", marginHorizontal: 5, flexGrow: 1, elevation: 2, minWidth: 100 },
  saveButton: { backgroundColor: "#007BFF" },
  cancelButton: { backgroundColor: "#6c757d" },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 14, textAlign: 'center' },
  confirmationContainer: { position: "absolute", bottom: 30, left: 20, right: 20, backgroundColor: "white", borderRadius: 10, padding: 15, elevation: 5, zIndex: 2 },
  confirmationText: { fontSize: 16, textAlign: "center", marginBottom: 15 },
  confirmationButtonContainer: { flexDirection: "row" },
  confirmationButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", marginHorizontal: 10 },
  drawingControls: { position: "absolute", top: (Constants.statusBarHeight || 20) + 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-around", zIndex: 2, backgroundColor: "rgba(255,255,255,0.85)", padding: 8, borderRadius: 8 },
  gpsButton: { position: 'absolute', bottom: 180, right: 20, width: 55, height: 55, borderRadius: 30, backgroundColor: '#007BFF', justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 1 },
  gpsButtonText: { fontSize: 28, color: 'white' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 255, 255, 0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  calloutContainer: { width: 220, padding: 10, backgroundColor: 'white', borderRadius: 6, borderColor: '#777', borderWidth: 0.5, },
  calloutTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, color: '#333'},
  calloutText: { fontSize: 12, marginBottom: 3, color: '#555' },
  // --- NOVOS ESTILOS PARA O FILTRO ---
  filterContainer: {
    position: 'absolute',
    bottom: 110, // Posição acima do botão GPS
    left: 20,
    right: 20,
    height: 50,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 25,
    elevation: 5,
    zIndex: 1,
    overflow: 'hidden',
  },
  filterButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#007BFF', // Cor de destaque
  },
  filterButtonText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#000', // Cor padrão
  },
  // Ajuste o texto do botão ativo se desejar (opcional, pode ser feito no componente)
  // filterButtonTextActive: {
  //   color: '#FFFFFF',
  // }
});