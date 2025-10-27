import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Modal, Pressable, TextInput, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
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
const processBasicData = (properties: Property[]): Property[] => {
  if (!properties || properties.length === 0) return [];
  return properties.map(prop => ({
    ...prop,
    latitude: Number(prop.latitude) || 0,
    longitude: Number(prop.longitude) || 0,
  }));
};

export default function MapScreen() {
  console.log("--- MapScreen RENDERED ---");

  // --- Estados ---
  const { authToken, isGuest } = useAuth();
  const { properties: userProperties, addProperty, fetchProperties } = useProperties();
// app/(tabs)/index.tsx
  const { locationToFocus, clearLocationToFocus } = useMap();
  const userPropertyIds = useMemo(() => 
    new Set(userProperties.map(p => p.id))
  , [userProperties]);
  const mapViewRef = useRef<MapView>(null);
  const isFocused = useIsFocused();
  // mapProperties guarda dados BRUTOS (boundary é string JSON ou GeoJSON object)
  const [mapProperties, setMapProperties] = useState<Property[]>([]);
  // Cache para todas as propriedades públicas
  const [publicPropertiesCache, setPublicPropertiesCache] = useState<Property[]>([]);
  // Estado do filtro
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');
  // index.tsx
  // ... (abaixo de currentRegion)

  // CACHE DE POLÍGONOS: Armazena apenas os polígonos baixados. Formato: { "prop_id": "boundary_data" }
  const [visibleBoundaries, setVisibleBoundaries] = useState<{[key: string]: any}>({});
  
  // ESTADOS DE CARREGAMENTO (isLoading já existe)
  const [isFetchingData, setIsFetchingData] = useState(false); // Para carregar polígonos
  
  // ESTADOS DE CONTROLE (Refs) - Para evitar loops
  const isFetchingBoundariesRef = useRef(false);
  const initialMarkerFetchDone = useRef(false);
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
  const processedUserProperties = useMemo(() => {
    return processBasicData(userProperties);
  }, [userProperties]); // Só recalcula se 'userProperties' mudar
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
 // index.tsx

  // --- NOVAS FUNÇÕES DE FETCH OTIMIZADAS ---

  // 1. Busca todos os MARCADORES públicos (leve) - SÓ UMA VEZ
  const fetchAllPublicMarkers = useCallback(async () => {
    // Usa o Ref para garantir que só seja chamado uma vez
    if (initialMarkerFetchDone.current) return;
    initialMarkerFetchDone.current = true;

    console.log("Buscando TODOS os marcadores públicos (leve)...");
    setIsLoading(true);
    try {
      // Chama a nova ROTA 1
      const response = await axios.get(`${API_URL}/properties/public/markers`);
      if (response.data && Array.isArray(response.data)) {
         setPublicPropertiesCache(response.data); // Salva no cache
      }
    } catch (error) {
      console.error("Erro ao buscar marcadores públicos:", error);
      Alert.alert("Erro", "Não foi possível carregar os marcadores públicos.");
    } finally {
      setIsLoading(false);
    }
  }, []); // Array de dependências VAZIO garante que a função é estável

  // 2. Busca os POLÍGONOS para a viewport (sob demanda)
  const fetchViewportBoundaries = useCallback(async (region: Region | null) => {
    // Proteção contra chamadas múltiplas ou desnecessárias
    if (!region || isFetchingBoundariesRef.current || filterMode === 'mine') {
      return;
    }
    
    // Se o zoom estiver longe, limpa os polígonos e sai
    if (region.latitudeDelta > POLYGON_VISIBILITY_ZOOM_THRESHOLD) {
      setVisibleBoundaries({});
      return;
    }

    console.log(`Buscando POLÍGONOS para o viewport (Zoom: ${region.latitudeDelta})`);
    isFetchingBoundariesRef.current = true;
    setIsFetchingData(true); // Mostra o loading "Carregando..."

    const params = {
      minLat: region.latitude - (region.latitudeDelta / 2),
      maxLat: region.latitude + (region.latitudeDelta / 2),
      minLng: region.longitude - (region.longitudeDelta / 2),
      maxLng: region.longitude + (region.longitudeDelta / 2),
      latitudeDelta: region.latitudeDelta
    };

    try {
      // Chama a nova ROTA 2
      const response = await axios.get(`${API_URL}/properties/public/boundaries`, { params });
      
      if (response.data && Array.isArray(response.data)) {
         // Transforma o array [ {id: 1, boundary: ...}, ... ]
         // Em um objeto { "1": boundary_data, ... } para lookup rápido
         const boundariesMap = response.data.reduce((acc, prop) => {
           acc[prop.id] = prop.boundary;
           return acc;
         }, {});
         setVisibleBoundaries(boundariesMap);
      } else {
         setVisibleBoundaries({});
      }
    } catch (error) {
      console.error("Erro ao buscar polígonos do viewport:", error);
      setVisibleBoundaries({});
    } finally {
      isFetchingBoundariesRef.current = false;
      setIsFetchingData(false);
    }
  }, [filterMode]); // Só depende do filterMode


  // (ATUALIZADO) useEffect principal de dados
useEffect(() => {
    console.log("--- useEffect DATA Processing (Hybrid) ---");

    if (locationToFocus && isFocused) {
        console.log("Foco detectado, carregando propriedades do usuário.");
        setFilterMode('mine'); 
        // ATUALIZADO: Usa a variável memoizada
        if (mapProperties !== processedUserProperties) { 
          setMapProperties(processedUserProperties as any);
        }
        return;
    }

    if (isFocused) {
      if (isGuest) {
        setFilterMode('all');
        fetchAllPublicMarkers();
      } else {
        if (filterMode === 'all') {
          if (publicPropertiesCache.length === 0) {
            fetchAllPublicMarkers();
          } else {
            if (mapProperties !== publicPropertiesCache) {
              setMapProperties(publicPropertiesCache);
            }
          }
          fetchViewportBoundaries(currentRegion);
        } else { // filterMode === 'mine'
          // ATUALIZADO: Usa a variável memoizada
          if (mapProperties !== processedUserProperties) { 
            setMapProperties(processedUserProperties as any);
          }
          setVisibleBoundaries({});
        }
      }
    }
  }, [
    isGuest, isFocused, filterMode, 
    locationToFocus, currentRegion, fetchAllPublicMarkers, 
    fetchViewportBoundaries, publicPropertiesCache, mapProperties,
    processedUserProperties // ATUALIZADO: Adiciona a nova dependência
  ]);

  // Foca mapa
  // app/(tabs)/index.tsx
  // Foca mapa
  useEffect(() => {
    if (isFocused && locationToFocus && mapViewRef.current) {
      console.log("Focando no local:", locationToFocus);
      mapViewRef.current.animateToRegion({
        ...locationToFocus,
        latitudeDelta: 0.01, // Zoom bem próximo
        longitudeDelta: 0.01,
      }, 1000);
      
      clearLocationToFocus(); // <-- ADICIONE ISTO PARA EVITAR O LOOP
    }
  }, [locationToFocus, isFocused, clearLocationToFocus]); // <-- ADICIONE A DEPENDÊNCIA

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
  const handleMarkerPress = async (property: Property) => {
    const propId = property.id ?? property.car_code;
    setSelectedMarkerId(propId);

    // 1. Se a propriedade NÃO TIVER Plus Code (como as do banco)
    if (!property.plus_code) {
      setIsFetchingPlusCode(true);
      setSelectedMarkerPlusCode('Buscando...');
      
      // 2. Busca o Plus Code na API do Google
      const foundPlusCode = await getPlusCodeFromCoordinates(property.latitude, property.longitude);
      
      if (foundPlusCode) {
        setSelectedMarkerPlusCode(foundPlusCode);

        // --- INÍCIO DA NOVA LÓGICA ---

        // 3. Salva o Plus Code no Banco de Dados (Write-Back)
        axios.patch(`${API_URL}/properties/public/${property.id}/pluscode`, { plus_code: foundPlusCode })
          .then(() => console.log(`Plus Code salvo para ${property.id}`))
          .catch(err => console.warn("Não foi possível salvar o Plus Code no DB:", err));

        // 4. Atualiza o estado local para evitar buscas futuras
        const updateState = (prevState: Property[]) => prevState.map(p =>
          p.id === property.id ? { ...p, plus_code: foundPlusCode } : p
        );
        setMapProperties(updateState);
        
        if (filterMode === 'all') {
          setPublicPropertiesCache(updateState);
        }
        
        // --- FIM DA NOVA LÓGICA ---

      } else {
        setSelectedMarkerPlusCode('Não encontrado');
      }
      setIsFetchingPlusCode(false);
    } 
    // 5. Se a propriedade JÁ TIVER Plus Code, apenas exibe
    else {
      setSelectedMarkerPlusCode(property.plus_code);
    }
  };
  
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
        onRegionChangeComplete={(region: Region) => {
          setCurrentRegion(region); // Atualiza o estado da região
          // Se estiver no modo 'all', busca os POLÍGONOS da nova região
          if (filterMode === 'all') {
            fetchViewportBoundaries(region);
          }
        }}
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
              const isOwner = userPropertyIds.has(prop.id);
              const markerColor = isOwner ? "blue" : "green"; // 'blue' para o dono, 'green' para outros
              const polygonStrokeColor = isOwner ? "rgba(0, 0, 255, 0.5)" : "rgba(0, 100, 0, 0.5)";
              const polygonFillColor = isOwner ? "rgba(0, 0, 255, 0.15)" : "rgba(0, 100, 0, 0.15)";
              // --- FIM DA NOVA LÓGICA DE COR ---
              // Busca o polígono no cache 'visibleBoundaries'
              let boundaryData = visibleBoundaries[prop.id];

              if (!boundaryData && prop.boundary) {
                boundaryData = prop.boundary;
              }
              
              // Processa o polígono SOMENTE se ele foi encontrado no cache
                const polygonCoords = (shouldRenderPolygon && boundaryData) 
                ? parseBoundaryToLatLng(boundaryData, String(prop.car_code)) 
                : [];

              if (isNaN(coord.latitude) || isNaN(coord.longitude)) return null;

              return (
                 <React.Fragment key={propId}>
                <Marker
                  identifier={propId.toString()} // ID único para o marcador
                  coordinate={coord}             // Coordenadas do centroide
                  pinColor={markerColor}         // Cor dinâmica (azul para dono, verde para outros)
                  title={String(prop.nome_propriedade ?? "Propriedade")} // Título padrão do marcador (pode aparecer em algumas interações)
                  // Descrição padrão do marcador, mostra o Plus Code se já existir
                  description={`Plus Code: ${prop.plus_code ?? (isSelected ? selectedMarkerPlusCode ?? '...' : '...')}`} 
                  onPress={(e) => { e.stopPropagation(); handleMarkerPress(prop); }} // Chama a função ao clicar no PINO
                  onDeselect={() => { if (isSelected) { setSelectedMarkerId(null); setSelectedMarkerPlusCode(null); } }} // Limpa seleção
                  zIndex={isSelected ? 1 : 0} // Coloca o marcador selecionado acima
                >
                </Marker>
                   {/* 4. Renderiza o polígono se as condições forem atendidas */}
                   {shouldRenderPolygon && polygonCoords.length > 0 && (
                     <Polygon
                       coordinates={polygonCoords} // Usa o array recém-parseado
                       strokeColor={polygonStrokeColor}
                       fillColor={polygonFillColor}
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
        {/* Substitui o Text por um Ícone */}
        <FontAwesome name="location-arrow" size={24} color="white" />
      </Pressable>

      {/* --- NOVO: Botões de Filtro --- */}
      {!isGuest && (
        <View style={styles.filterContainer}>
          <Pressable
            style={[styles.filterButton, filterMode === 'all' && styles.filterButtonActive]}
            onPress={() => setFilterMode('all')}
          >
            {/* Cor do texto muda se estiver ativo */}
            <Text style={[styles.filterButtonText, { color: filterMode === 'all' ? '#FFFFFF' : '#007BFF' }]}>Todas</Text>
          </Pressable>
          <Pressable
            style={[styles.filterButton, filterMode === 'mine' && styles.filterButtonActive]}
            onPress={() => setFilterMode('mine')}
          >
            {/* Cor do texto muda se estiver ativo */}
            <Text style={[styles.filterButtonText, { color: filterMode === 'mine' ? '#FFFFFF' : '#007BFF' }]}>Minhas</Text>
          </Pressable>
        </View>
      )}
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

      {(isLoading) && (
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
  gpsButton: {
    position: 'absolute',
    bottom: 40, // <-- Mais baixo
    right: 20,
    width: 55, height: 55, borderRadius: 30, backgroundColor: '#007BFF', justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 1
  },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 255, 255, 0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  calloutContainer: { width: 220, padding: 10, backgroundColor: 'white', borderRadius: 6, borderColor: '#777', borderWidth: 0.5, },
  calloutTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, color: '#333'},
  calloutText: { fontSize: 12, marginBottom: 3, color: '#555' },
  // --- NOVOS ESTILOS PARA O FILTRO ---
    filterContainer: {
    position: 'absolute',
    // top: (Constants.statusBarHeight || 20) + 10, // Posição abaixo da status bar
    top: 60, // Ou um valor fixo se preferir
    left: '50%', // Centraliza horizontalmente
    transform: [{ translateX: -100 }], // Ajusta para o centro exato (metade da largura)
    width: 200, // Largura fixa para o container
    height: 40, // Altura um pouco menor
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.9)', // Fundo branco semi-transparente
    borderRadius: 20, // Bordas mais arredondadas
    elevation: 4, // Sombra (Android)
    shadowColor: '#000', // Sombra (iOS)
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    zIndex: 1,
    overflow: 'hidden',
  },
  filterButton: { // Mantém o flex para dividir espaço
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: { // Mantém a cor de destaque
    backgroundColor: '#007BFF',
  },
  filterButtonText: { // Estilo do texto
    fontWeight: '600', // Um pouco mais bold
    fontSize: 14, // Ligeiramente menor
    // Cor dinâmica: Branca se ativo, azul se inativo
    // (Ajustaremos isso no componente)
  },
  // Ajuste o texto do botão ativo se desejar (opcional, pode ser feito no componente)
  // filterButtonTextActive: {
  //   color: '#FFFFFF',
  // }
});

