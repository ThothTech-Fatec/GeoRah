import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Modal, Pressable, TextInput, Alert, FlatList } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE, LatLng, MapPressEvent, Polygon, Region, Polyline } from 'react-native-maps';
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
const POLYGON_VISIBILITY_ZOOM_THRESHOLD = 0.1; // Mais perto
// Nível de zoom para mostrar MARCADORES
const MARKER_VISIBILITY_ZOOM_THRESHOLD = 0.6; // Mais afastado (mostra antes dos polígonos)

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
const isPointInPolygon = (point: LatLng, polygon: LatLng[]): boolean => {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const x = point.longitude, y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude, yi = polygon[i].latitude;
    const xj = polygon[j].longitude, yj = polygon[j].latitude;

    const intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
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
  const [visibleBoundaries, setVisibleBoundaries] = useState<{ [key: string]: any }>({});

  // ESTADOS DE CARREGAMENTO (isLoading já existe)
  const [isFetchingData, setIsFetchingData] = useState(false); // Para carregar polígonos

  // ESTADOS DE CONTROLE (Refs) - Para evitar loops
  const isFetchingBoundariesRef = useRef(false);
  const initialMarkerFetchDone = useRef(false);
  // app/(tabs)/index.tsx

  // ... outros estados ...

  // --- ESTADOS DO SISTEMA DE ROTAS (ETAPA 5) ---
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeOriginId, setRouteOriginId] = useState<number | string | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0); // 0 = Principal, 1 = Alternativa
  const [routeDestinationId, setRouteDestinationId] = useState<number | string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRouteListVisible, setIsRouteListVisible] = useState(false);
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
  const currentRoute = routes[selectedRouteIndex] || null;
  const initialRegion: Region = { latitude: -21.888341, longitude: -51.499488, latitudeDelta: 0.8822, longitudeDelta: 0.5821 };
  const [currentRegion, setCurrentRegion] = useState<Region | null>(initialRegion);
  const processedUserProperties = useMemo(() => {
    return processBasicData(userProperties);
  }, [userProperties]); // Só recalcula se 'userProperties' mudar
  // --- Efeitos ---

  const isSelectedOwner = useMemo(() => {
    if (!selectedMarkerId) return false;
    return userPropertyIds.has(Number(selectedMarkerId));
  }, [selectedMarkerId, userPropertyIds]);

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
  // --- FUNÇÕES DO SISTEMA DE ROTAS ---

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
  // Filtra as propriedades baseado na busca (Nome ou CAR)
  const filteredDestinations = useMemo(() => {
    if (!isRouteListVisible) return [];

    const term = searchQuery.toLowerCase();

    // LÓGICA NOVA:
    // Se cliquei na MINHA propriedade (isSelectedOwner), listo TODAS as outras para ser Destino.
    // Se cliquei na de OUTRO ( !isSelectedOwner), listo só as MINHAS para ser Origem.
    const sourceList = isSelectedOwner ? mapProperties : userProperties;

    return sourceList.filter(p => {
      // 1. Remove o marcador selecionado da lista (não faz sentido rota para si mesmo)
      const isNotSelected = String(p.id) !== String(selectedMarkerId);

      // 2. Filtro de Texto
      const matchesName = p.nome_propriedade?.toLowerCase().includes(term);
      const matchesCar = p.car_code?.toLowerCase().includes(term);

      return isNotSelected && (matchesName || matchesCar);
    });
  }, [mapProperties, userProperties, selectedMarkerId, searchQuery, isRouteListVisible, isSelectedOwner]);

  // Função que chama o Backend para traçar a rota
const handleTraceRoute = async (targetId: number) => {
    if (!selectedMarkerId) return;

    setSearchQuery('');
    setIsRouteListVisible(false);
    setIsLoading(true);
    
    setRoutes([]); 
    setSelectedRouteIndex(0);
    setRouteDestinationId(null);

    try {
      const selectedId = selectedMarkerId; // ID do marcador clicado no mapa
      let originId, destinationId;

      // Define quem é quem baseado se o marcador clicado é seu ou não
      if (isSelectedOwner) {
        originId = selectedId;      // Clicou no seu -> Sai dele
        destinationId = targetId;   // Vai para o da lista
      } else {
        originId = targetId;        // Clicou no de outro -> Sai do seu (lista)
        destinationId = selectedId; // Vai para o clicado
      }

      // Salva a Origem correta no estado
      setRouteOriginId(originId); 

      console.log(`🛣️ Buscando rotas: ${originId} -> ${destinationId}`);

      const response = await axios.get(`${API_URL}/routes/custom`, {
        params: { originId, destinationId },
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const { main, alternative } = response.data;

      if (main) {
        const foundRoutes = [main];
        if (alternative) foundRoutes.push(alternative);

        setRoutes(foundRoutes);
        
        // --- A CORREÇÃO ESTÁ AQUI ---
        // Antes estava: setRouteDestinationId(targetId);
        // Agora usamos a variável calculada, garantindo que o pino verde seja o destino
        setRouteDestinationId(destinationId); 
        // ----------------------------
        
        if (mapViewRef.current && main.path) {
          mapViewRef.current.fitToCoordinates(main.path, {
            edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
      } else {
        Alert.alert("Aviso", "Nenhuma rota encontrada.");
      }

    } catch (error: any) {
      console.error("Erro rota:", error);
      Alert.alert("Erro", error.response?.data?.message || "Falha ao calcular rota.");
    } finally {
      setIsLoading(false);
    }
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
      const response = await axios.post(`${API_URL}/properties`, propertyData, { headers: { Authorization: `Bearer ${authToken}` } });
      console.log("Save successful:", response.data);
      if (response.data.newProperty) { addProperty(response.data.newProperty); }
      else { fetchProperties(); } // Recarrega o contexto
      Alert.alert("Sucesso!", "Propriedade registrada.");
      setIsModalVisible(false); setClickedLocation(null); setNomePropriedade(""); setCodigoCar(""); setPlusCode(null); setPolygonPoints([]); setIsDrawing(false);
    } catch (error) {
      console.error("Error saving property:", error);
      // eslint-disable-next-line import/no-named-as-default-member
      if (axios.isAxiosError(error) && error.response) { Alert.alert("Erro ao Salvar", error.response.data.message || `Erro ${error.response.status}`); }
      else { Alert.alert("Erro", "Não foi possível conectar."); }
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
        {currentRegion && (routes.length > 0 || currentRegion.latitudeDelta < MARKER_VISIBILITY_ZOOM_THRESHOLD) && (
          mapProperties
            .filter(prop => {
              // MODO ROTA: Se tiver rota ativa
              if (routes.length > 0) {
                 // 1. Normaliza o ID da propriedade (mesma lógica do clique)
                 const propId = prop.id ?? prop.car_code;
                 
                 // 2. Verifica se é Origem ou Destino (Comparação segura de String)
                 const isOrigin = routeOriginId ? String(propId) === String(routeOriginId) : false;
                 const isDest = routeDestinationId ? String(propId) === String(routeDestinationId) : false;
                 
                 // Se for qualquer um dos dois, mostra!
                 return isOrigin || isDest;
              }

              // MODO EXPLORAÇÃO (Sem rota)
              return isMarkerVisible({ latitude: prop.latitude, longitude: prop.longitude }, currentRegion);
           })
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
                    description={`Plus Code: ${prop.plus_code ?? (isSelected ? selectedMarkerPlusCode ?? '...' : '...')}`}
                    zIndex={isSelected ? 1 : 0} // Coloca o marcador selecionado acima
                    // 1. Só permite arrastar se for o dono
                    draggable={isOwner}
                    onPress={(e) => { e.stopPropagation(); handleMarkerPress(prop); setSelectedMarkerId(prop.id); }}
                    onDeselect={() => { if (isSelected) { setSelectedMarkerId(null); setSelectedMarkerPlusCode(null); } }}

                    onDragEnd={async (e) => {
                      const newCoordinate = e.nativeEvent.coordinate;
                      let boundaryToValidate = prop.boundary;

                      // 1. Tenta pegar do cache de polígonos visíveis
                      if (!boundaryToValidate) {
                        boundaryToValidate = visibleBoundaries[prop.id];
                      }
                      if (!boundaryToValidate) {
                        const userProp = userProperties.find(p => p.id === prop.id);
                        if (userProp) {
                          boundaryToValidate = userProp.boundary;
                        }
                      }

                      const polygonCoords = parseBoundaryToLatLng(boundaryToValidate, String(prop.car_code));
                      // B. Validação Matemática (Etapa 2)
                      // Se tiver polígono e o ponto estiver FORA dele:
                      if (polygonCoords.length > 2 && !isPointInPolygon(newCoordinate, polygonCoords)) {
                        Alert.alert("Movimento Inválido", "O ponto de entrada deve ficar DENTRO dos limites da propriedade.");
                        // Força uma re-renderização para o pino voltar para a posição original (visual snap-back)
                        setMapProperties([...mapProperties]);
                        return;
                      }

                      // C. Confirmação e Salvamento (Etapa 1)
                      Alert.alert(
                        "Definir Entrada",
                        "Deseja definir este ponto como a nova entrada da propriedade?",
                        [
                          {
                            text: "Cancelar",
                            style: "cancel",
                            onPress: () => setMapProperties([...mapProperties]) // Volta o pino se cancelar
                          },
                          {
                            text: "Sim",
                            onPress: async () => {
                              try {
                                // Chama a API criada na Etapa 1
                                await axios.patch(`${API_URL}/properties/${prop.id}/location`,
                                  { latitude: newCoordinate.latitude, longitude: newCoordinate.longitude },
                                  { headers: { Authorization: `Bearer ${authToken}` } }
                                );

                                // Atualiza o estado local para refletir a mudança permanentemente
                                const updatedProps = mapProperties.map(p =>
                                  p.id === prop.id ? { ...p, latitude: newCoordinate.latitude, longitude: newCoordinate.longitude } : p
                                );
                                setMapProperties(updatedProps);

                                // 2. Atualiza o cache de "Todas" (independente do modo, para garantir sincronia)
                                setPublicPropertiesCache(prev => prev.map(p =>
                                  p.id === prop.id ? { ...p, latitude: newCoordinate.latitude, longitude: newCoordinate.longitude } : p
                                ));

                                // 3. Atualiza o contexto de "Minhas Propriedades" (Fundamental para a troca de abas)
                                fetchProperties();

                                // Se estiver no modo 'all', atualiza o cache também
                                if (filterMode === 'all') {
                                  setPublicPropertiesCache(updatedProps);
                                }

                                Alert.alert("Sucesso", "Ponto de entrada atualizado.");
                              } catch (error) {
                                console.error(error);
                                Alert.alert("Erro", "Não foi possível atualizar a localização.");
                                setMapProperties([...mapProperties]); // Reverte em caso de erro
                              }
                            }
                          }
                        ]
                      );
                    }}
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
        {routes.map((route, index) => {
          const isSelected = index === selectedRouteIndex;
          return (
            <Polyline
              key={index}
              coordinates={route.path}
              // Rota Selecionada = Laranja (#FF5722) | Não Selecionada = Cinza (#90A4AE)
              strokeColor={isSelected ? "#FF5722" : "#90A4AE"}
              // Rota Selecionada é mais grossa
              strokeWidth={isSelected ? 6 : 5}
              // Rota Selecionada fica por cima (Z-Index maior)
              zIndex={isSelected ? 100 : 90}
              tappable={true}
              onPress={() => setSelectedRouteIndex(index)} // Clicar na linha cinza seleciona ela
            />
          );
        })}
      </MapView>
      {/* --- 1. PAINEL DE AÇÃO (Aparece ao clicar num marcador) --- */}
      {selectedMarkerId && routes.length === 0 && (
        <View style={styles.actionPanel}>
          <Text style={styles.actionPanelTitle}>Propriedade Selecionada</Text>

          <Pressable
            style={[styles.actionButton, { backgroundColor: '#FF5722', marginBottom: 10 }]}
            onPress={() => setIsRouteListVisible(true)}
          >
            {/* Ícone de estrada ou rota */}
            <FontAwesome name="location-arrow" size={16} color="white" style={{ marginRight: 8 }} />

            {/* Texto de AÇÃO claro e direto */}
            <Text style={styles.actionButtonText}>
              {isSelectedOwner ? "Partir deste local" : "Ir para este local"}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, { backgroundColor: '#757575' }]}
            onPress={() => setSelectedMarkerId(null)}
          >
            <Text style={styles.actionButtonText}>Fechar</Text>
          </Pressable>
        </View>
      )}

      {/* --- 2. CARD DE INFORMAÇÕES DA ROTA (Aparece ao ter rota) --- */}
      {routes.length > 0 && currentRoute && (
        <View style={[styles.routeInfoCard,
        // LÓGICA DE BORDA DINÂMICA:
        currentRoute.alert
          ? {
            borderColor: currentRoute.alert.severity === 'HIGH' ? '#FFCDD2'
              : currentRoute.alert.severity === 'MEDIUM' ? '#FFF9C4'
                : '#C8E6C9', // Verde para LOW
            borderWidth: 2
          }
          : {}
        ]}>
          <View style={{ flex: 1 }}>

            {/* 1. BARRA DE CLIMA (Agora mostra Tempo Bom também) */}
            {currentRoute.alert && (
              <View style={{
                flexDirection: 'row',
                // Cores de Fundo Dinâmicas
                backgroundColor: currentRoute.alert.severity === 'HIGH' ? '#FFEBEE'
                  : currentRoute.alert.severity === 'MEDIUM' ? '#FFFDE7'
                    : '#E8F5E9', // Verde Claro
                padding: 8,
                borderRadius: 6,
                marginBottom: 10,
                alignItems: 'center'
              }}>
                {/* Ícone Dinâmico: Sol para LOW, Alerta para outros */}
                <FontAwesome
                  name={currentRoute.alert.severity === 'LOW' ? 'sun-o' : 'exclamation-triangle'}
                  size={14}
                  // Cores do Ícone
                  color={currentRoute.alert.severity === 'HIGH' ? '#D32F2F'
                    : currentRoute.alert.severity === 'MEDIUM' ? '#FBC02D'
                      : '#2E7D32'} // Verde Escuro
                  style={{ marginRight: 6 }}
                />
                <Text style={{
                  // Cores do Texto
                  color: currentRoute.alert.severity === 'HIGH' ? '#C62828'
                    : currentRoute.alert.severity === 'MEDIUM' ? '#F57F17'
                      : '#1B5E20', // Verde Escuro
                  fontSize: 12,
                  fontWeight: 'bold',
                  flex: 1
                }}>
                  {currentRoute.alert.title}
                </Text>
              </View>
            )}

            {/* 2. SELETOR DE ROTAS (Mantido Igual) */}
            {routes.length > 1 ? (
              <View style={{ flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 2, marginBottom: 10, alignSelf: 'flex-start' }}>
                {routes.map((route, index) => {
                  const isActive = selectedRouteIndex === index;
                  return (
                    <Pressable
                      key={index}
                      onPress={() => setSelectedRouteIndex(index)}
                      style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: isActive ? 'white' : 'transparent', borderRadius: 6, elevation: isActive ? 2 : 0 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#FF5722' : '#999' }}>
                        {index === 0 ? "Principal" : "Alternativa"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              // Se não tem abas E não tem alerta, mostra o rótulo
              !currentRoute.alert && <Text style={styles.routeLabel}>ROTA PRINCIPAL</Text>
            )}

            {/* 3. DADOS DA ROTA */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#333', marginRight: 8 }}>
                {currentRoute.duration}
              </Text>
              <Text style={{ fontSize: 16, color: '#666', fontWeight: '500' }}>
                ({currentRoute.formattedDistance})
              </Text>
            </View>

            {/* 4. DESCRIÇÃO DO CLIMA */}
            {currentRoute.alert && (
              <Text style={{
                fontSize: 11,
                marginTop: 4,
                fontStyle: 'italic',
                color: currentRoute.alert.severity === 'LOW' ? '#388E3C' : '#D32F2F' // Verde ou Vermelho
              }}>
                {currentRoute.alert.description}
              </Text>
            )}

          </View>

          {/* 5. BOTÃO FECHAR */}
          <Pressable
            onPress={() => { setRoutes([]); setRouteDestinationId(null); setSelectedRouteIndex(0); setSelectedMarkerId(null); setRouteOriginId(null); }}
            style={{ marginLeft: 20, padding: 5 }}
          >
            <FontAwesome name="times-circle" size={36} color="#d9534f" />
          </Pressable>
        </View>
      )}

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
      {!isGuest && routes.length === 0 && (
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
      <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={() => { setIsModalVisible(false); setClickedLocation(null); setPolygonPoints([]); }}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registar Propriedade</Text>
            <Text style={styles.plusCodeText}>Plus Code: {String(plusCode || 'N/A')}</Text>
            <TextInput style={styles.input} placeholder="Nome da Propriedade" value={nomePropriedade} onChangeText={setNomePropriedade} />
            <TextInput style={styles.input} placeholder="Código CAR" value={codigoCar} onChangeText={setCodigoCar} />
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
              else if (clickedLocation) {
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
      {selectedMarkerId && (() => {
        const selectedProp = mapProperties.find(p => (p.id ?? p.car_code) === selectedMarkerId);
        if (!selectedProp) return null;
      })()}

      {(isLoading) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text>Carregando...</Text>
        </View>
      )}
      {/* --- 3. MODAL DE SELEÇÃO DE DESTINO --- */}
      <Modal
        visible={isRouteListVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsRouteListVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { maxHeight: '80%', width: '90%' }]}>
            <           Text style={styles.modalTitle}>
              {isSelectedOwner ? "Definir Destino" : "Definir Ponto de Partida"}
            </Text>

            {/* SUBTÍTULO SIMPLES */}
            <Text style={{ marginBottom: 15, color: '#666', textAlign: 'center' }}>
              {isSelectedOwner
                ? "Selecione o destino da rota:"
                : "Escolha o ponto de partida:"}
            </Text>
            {/* --- BARRA DE PESQUISA --- */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#f0f0f0',
              borderRadius: 8,
              paddingHorizontal: 10,
              marginBottom: 15,
              borderWidth: 1,
              borderColor: '#ddd'
            }}>
              <FontAwesome name="search" size={18} color="#999" />
              <TextInput
                style={{
                  flex: 1,
                  height: 45,
                  paddingHorizontal: 10,
                  fontSize: 16,
                  color: '#333'
                }}
                placeholder="Buscar por Nome ou CAR..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <FontAwesome name="times-circle" size={18} color="#999" />
                </Pressable>
              )}
            </View>

            <Text style={{ marginBottom: 5, color: '#666', fontSize: 12 }}>
              {filteredDestinations.length} propriedades encontradas
            </Text>

            <FlatList
              data={filteredDestinations} // <--- USA A LISTA FILTRADA AGORA
              keyExtractor={(item) => item.id.toString()}
              style={{ width: '100%' }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" // Permite clicar na lista com teclado aberto
              renderItem={({ item }) => (
                <Pressable
                  style={{
                    paddingVertical: 15,
                    borderBottomWidth: 1,
                    borderBottomColor: '#f0f0f0',
                    flexDirection: 'row',
                    alignItems: 'center'
                  }}
                  onPress={() => handleTraceRoute(item.id)}
                >
                  <View style={{ backgroundColor: '#FFF3E0', padding: 10, borderRadius: 8, marginRight: 15 }}>
                    <FontAwesome name="map-marker" size={24} color="#FF5722" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#333' }}>{item.nome_propriedade}</Text>
                    <Text style={{ color: '#888', fontSize: 13 }}>CAR: {item.car_code}</Text>
                  </View>
                  <FontAwesome name="chevron-right" size={14} color="#ccc" />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 30 }}>
                  <FontAwesome name="search-minus" size={40} color="#ddd" />
                  <Text style={{ textAlign: 'center', marginTop: 10, color: '#999' }}>
                    Nenhuma propriedade encontrada para &quot;{searchQuery}&quot;
                  </Text>
                </View>
              }
            />

            <Pressable
              style={[styles.button, styles.cancelButton, { marginTop: 15, width: '100%' }]}
              onPress={() => { setIsRouteListVisible(false); setSearchQuery(''); }}
            >
              <Text style={styles.buttonText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  calloutTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, color: '#333' },
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
  actionPanel: {
    position: 'absolute',
    bottom: 180, // Acima dos filtros/GPS
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    alignItems: 'center',
    zIndex: 100,
  },
  actionPanelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '100%',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // --- ESTILOS DE ROTA E PAINEL ---
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  actionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', flex: 1 },
  actionSubtitle: { fontSize: 14, color: '#666', marginBottom: 15 },
  actionButtonsRow: { flexDirection: 'row', gap: 10 },
  panelButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 8, elevation: 2
  },
  panelButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  routeInfoCard: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'white',
    borderRadius: 30,
    // AUMENTAMOS O ESPAÇAMENTO INTERNO
    paddingVertical: 20, // Antes era 10
    paddingHorizontal: 30, // Antes era 20

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 5,

    // AUMENTAMOS A LARGURA MÍNIMA
    minWidth: 320, // Antes era 200 (dá mais espaço para os km)

    zIndex: 100,
  },
  routeLabel: { fontSize: 10, color: '#888', fontWeight: 'bold' },
  routeValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },

  selectionHint: {
    position: 'absolute', top: 110, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', zIndex: 99
  }
});

