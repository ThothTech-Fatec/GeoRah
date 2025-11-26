import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Modal, Pressable, TextInput, Alert, FlatList, Keyboard, Share, Image } from 'react-native';
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
import { useFocusEffect } from '@react-navigation/native'; // <--- Importante
import * as ImagePicker from 'expo-image-picker';

const API_URL = "http://10.0.2.2:3000"; // Ou IP correto
const API_KEY = Constants.expoConfig?.extra?.googleApiKey; // Garanta que está configurada

// --- NÍVEIS DE ZOOM ---
// Nível de zoom (latitudeDelta) para mostrar polígonos
const POLYGON_VISIBILITY_ZOOM_THRESHOLD = 0.1; // Mais perto
// Nível de zoom para mostrar MARCADORES
const MARKER_VISIBILITY_ZOOM_THRESHOLD = 0.03; // Mais afastado (mostra antes dos polígonos)

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

type AlertType = 'ANIMAL' | 'OBSTACLE' | 'BROKEN_VEHICLE' | 'ACCIDENT' | 'CONSTRUCTION' | 'BLOCKED';

interface RoadAlert {
  id: string;
  lat: number;
  lng: number;
  type: AlertType;
  timestamp: number;
}

// Mapa de ícones e cores para cada tipo de alerta
const ALERT_CONFIG: Record<AlertType, { label: string; icon: string; color: string }> = {
  ANIMAL: { label: 'Animal na Pista', icon: 'paw', color: '#FF9800' }, // Laranja
  OBSTACLE: { label: 'Obstáculo', icon: 'cube', color: '#FFC107' }, // Amarelo
  BROKEN_VEHICLE: { label: 'Veículo Quebrado', icon: 'car', color: '#607D8B' }, // Cinza
  ACCIDENT: { label: 'Acidente', icon: 'exclamation-circle', color: '#D32F2F' }, // Vermelho
  CONSTRUCTION: { label: 'Obras', icon: 'wrench', color: '#F57C00' }, // Laranja Escuro
  BLOCKED: { label: 'Bloqueio', icon: 'ban', color: '#B71C1C' }, // Vermelho Escuro
};

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
  const [selectedClusterAlerts, setSelectedClusterAlerts] = useState<RoadAlert[] | null>(null);
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
  const [mapAlerts, setMapAlerts] = useState<RoadAlert[]>([]);
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');
  const [visibleBoundaries, setVisibleBoundaries] = useState<{ [key: string]: any }>({});
  const [isFetchingData, setIsFetchingData] = useState(false);
  const isFetchingBoundariesRef = useRef(false);
  const initialMarkerFetchDone = useRef(false);
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
  // Região de fallback para quando o GPS falhar ou for negado
  const FALLBACK_REGION: Region = { latitude: -21.888341, longitude: -51.499488, latitudeDelta: 0.8822, longitudeDelta: 0.5821 };

  // O Mapa só será renderizado quando este estado for preenchido (no useEffect)
  const [initialMapRegion, setInitialMapRegion] = useState<Region | null>(null);

  // O currentRegion pode ser inicializado com o fallback ou null
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const processedUserProperties = useMemo(() => {
    return processBasicData(userProperties);
  }, [userProperties]); // Só recalcula se 'userProperties' mudar

  const [listLimit, setListLimit] = useState(20); // Começa mostrando 20

  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isGlobalSearchFocused, setIsGlobalSearchFocused] = useState(false);

  // Estado para controlar o loading da foto
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // No início do componente MapScreen
  const [isFullScreenImageVisible, setIsFullScreenImageVisible] = useState(false);

  // --- Efeitos ---

  const isSelectedOwner = useMemo(() => {
    if (!selectedMarkerId) return false;
    return userPropertyIds.has(Number(selectedMarkerId));
  }, [selectedMarkerId, userPropertyIds]);


  // Reseta a paginação quando o modal abre ou fecha
  useEffect(() => {
    if (!isRouteListVisible) {
      setListLimit(20); // Volta para 20 itens
    }
  }, [isRouteListVisible]);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'O mapa será centralizado no padrão.');
        if (isMounted) {
          setInitialMapRegion(FALLBACK_REGION);
          setCurrentRegion(FALLBACK_REGION);
        }
        return;
      }

      try {
        // 1. Pega a posição ATUAL precisa para o "nascimento" do mapa
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High
        });

        const initialCoords = {
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude
        };

        // ZOOM BEM PRÓXIMO (0.005)
        const newInitialRegion = {
          ...initialCoords,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005
        };

        if (isMounted) {
          setUserLocation(initialCoords);
          setCurrentRegion(newInitialRegion);
          // Libera o mapa para renderizar já no lugar certo
          setInitialMapRegion(newInitialRegion);
        }

        // 2. Monitoramento contínuo
        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 2 },
          (location) => {
            if (isMounted) {
              setUserLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
              });
            }
          }
        );
      } catch (error) {
        console.log("Erro GPS:", error);
        if (isMounted) {
          setInitialMapRegion(FALLBACK_REGION);
          setCurrentRegion(FALLBACK_REGION);
        }
      }
    };

    startWatching();

    // --- LIMPEZA ---
    return () => {
      isMounted = false; // Garante que não atualiza o estado se desmontado
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  const clusteredAlerts = useMemo(() => {
    const grouped: { [key: string]: RoadAlert[] } = {};

    // 1. Agrupa por posição
    mapAlerts.forEach(alert => {
      const key = `${alert.lat.toFixed(4)},${alert.lng.toFixed(4)}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(alert);
    });

    // 2. Retorna array de grupos
    return Object.values(grouped);
  }, [mapAlerts]);




  // --- NOVAS FUNÇÕES DE FETCH OTIMIZADAS ---

  // 1. Busca todos os MARCADORES públicos
  const fetchAllPublicMarkers = useCallback(async (force: boolean = false) => {
    // Se NÃO for forçado E já tiver feito o fetch inicial, para aqui.
    if (!force && initialMarkerFetchDone.current) return;

    initialMarkerFetchDone.current = true;

    console.log("Buscando TODOS os marcadores públicos...");
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/properties/public/markers`);
      if (response.data && Array.isArray(response.data)) {
        setPublicPropertiesCache(response.data); // Atualiza o cache com os nomes novos
      }
    } catch (error) {
      console.error("Erro ao buscar marcadores públicos:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- ATUALIZAÇÃO AUTOMÁTICA AO VOLTAR PARA A TELA ---
  useFocusEffect(
    useCallback(() => {
      // 1. Atualiza "Minhas Propriedades" (Contexto)
      fetchProperties();

      // 2. Atualiza "Todas as Propriedades" (Cache Público)
      // Passamos 'true' para FORÇAR a atualização ignorando a trava
      fetchAllPublicMarkers(true);

      console.log("🔄 Tela focada: Dados atualizados.");
    }, [fetchProperties, fetchAllPublicMarkers])
  );

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

  const globalSearchResults = useMemo(() => {
    if (!globalSearchQuery || globalSearchQuery.length < 2) return [];

    const term = globalSearchQuery.toLowerCase();
    // Usa o cache de TUDO para filtrar
    return publicPropertiesCache.filter(p =>
      p.nome_propriedade?.toLowerCase().includes(term) ||
      p.car_code?.toLowerCase().includes(term)
    ).slice(0, 5); // Limita a 5 resultados para não poluir a tela
  }, [globalSearchQuery, publicPropertiesCache]);




  // Filtra as propriedades baseado na busca (Nome ou CAR)
  const filteredDestinations = useMemo(() => {
    if (!isRouteListVisible) return [];

    const term = searchQuery.toLowerCase();

    // Se tiver busca digitada, aumentamos o limite automaticamente para achar o resultado
    // Se não tiver busca, usa o limite da paginação
    const limit = term.length > 0 ? 100 : listLimit;

    const sourceList = isSelectedOwner ? publicPropertiesCache : userProperties;

    if (!sourceList) return [];

    const filtered = sourceList.filter(p => {
      const propId = p.id ?? p.car_code;
      const isNotSelected = String(propId) !== String(selectedMarkerId);

      // Se não tiver termo de busca, retorna tudo (respeitando o filtro acima)
      if (term.length === 0) return isNotSelected;

      const matchesName = p.nome_propriedade?.toLowerCase().includes(term);
      const matchesCar = p.car_code?.toLowerCase().includes(term);

      return isNotSelected && (matchesName || matchesCar);
    });

    // Retorna apenas a fatia atual baseada no limite
    return filtered.slice(0, limit);

  }, [publicPropertiesCache, userProperties, selectedMarkerId, searchQuery, isRouteListVisible, isSelectedOwner, listLimit]); // Adicione listLimit aqui!



  // Função que chama o Backend para traçar a rota
  const handleTraceRoute = async (
    targetId: number | string | null,
    useGpsMode: 'GPS_TO_PROP' | 'PROP_TO_GPS' | null = null
  ) => {
    // 1. Definições Iniciais
    const selectedId = selectedMarkerId;
    console.log(`🏁 Rota: target=${targetId}, mode=${useGpsMode}, selected=${selectedId}`);

    // Limpezas visuais
    setSearchQuery('');
    setIsRouteListVisible(false);
    setIsLoading(true);
    setRoutes([]); setSelectedRouteIndex(0); setRouteDestinationId(null); setRouteOriginId(null);

    try {
      const params: any = {};

      // --- MODO 1: Envolve GPS (Onde a mágica acontece) ---
      if (useGpsMode) {
        if (!userLocation) {
          Alert.alert("Aguarde", "Sua localização GPS ainda não foi carregada.");
          setIsLoading(false);
          return;
        }

        // Caso A: Sair do GPS -> Ir para Propriedade Selecionada
        // (Ex: Estou na cidade e quero ir pra minha fazenda)
        if (useGpsMode === 'GPS_TO_PROP') {
          const destId = targetId ? targetId : selectedId; // Se veio da lista usa target, se não usa o selecionado
          if (!destId) throw new Error("Destino não identificado.");

          params.destinationId = destId;
          params.userLat = userLocation.latitude;
          params.userLng = userLocation.longitude;

          // Visual: Destino é a propriedade
          setRouteDestinationId(destId);
        }

        // Caso B: Sair da Propriedade Selecionada -> Ir para GPS
        // (Ex: Estou na minha fazenda e quero ir para onde meu celular está marcando - raro, mas possível, ou vice-versa na lógica)
        else if (useGpsMode === 'PROP_TO_GPS') {
          const originId = selectedId; // A origem é o pino clicado
          if (!originId) throw new Error("Origem não identificada.");

          params.originId = originId;
          params.userLat = userLocation.latitude;
          params.userLng = userLocation.longitude;

          // Visual: Origem é a propriedade
          setRouteOriginId(originId);
        }
      }

      // --- MODO 2: Propriedade para Propriedade (Sem GPS) ---
      else if (targetId) {
        // Lógica: Se o pino selecionado é MEU, ele é Origem. Se é do VIZINHO, ele é Destino.
        let originId, destinationId;

        if (isSelectedOwner) {
          originId = selectedId;      // Clicou no seu -> Sai dele
          destinationId = targetId;   // Vai para o da lista
        } else {
          originId = targetId;        // Clicou na lista (sua) -> Sai dela
          destinationId = selectedId; // Vai para o pino (vizinho)
        }

        params.originId = originId;
        params.destinationId = destinationId;

        setRouteOriginId(originId);
        setRouteDestinationId(destinationId);
      }

      // --- CHAMADA AO BACKEND ---
      console.log("🛣️ Params API:", params);
      const response = await axios.get(`${API_URL}/routes/custom`, {
        params,
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const { main, alternative } = response.data;

      if (main) {
        const foundRoutes = [main];

        // Só adiciona se o backend realmente mandou uma alternativa válida
        if (alternative) {
          foundRoutes.push(alternative);
        }

        setRoutes(foundRoutes);

        // 1. Força o mapa a mostrar TODAS as propriedades (para o destino aparecer)
        setFilterMode('all');

        // 2. Garante que os marcadores públicos sejam carregados se ainda não foram
        if (publicPropertiesCache.length === 0) {
          fetchAllPublicMarkers();
        }

        if (mapViewRef.current && main.path) {
          setTimeout(() => {
            mapViewRef.current?.fitToCoordinates(main.path, {
              edgePadding: { top: 300, right: 50, bottom: 50, left: 50 },
              animated: true,
            });
          }, 100);
        }
      } else {
        Alert.alert("Aviso", "Nenhuma rota encontrada.");
      }

    } catch (error: any) {
      console.error("Erro rota:", error);
      Alert.alert("Erro", error.response?.data?.message || error.message || "Falha ao calcular rota.");
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

  // Função para compartilhar o link do Google Maps
  const handleShareProperty = async (property: Property) => {
    try {
      // 1. Define o que será buscado (Plus Code é prioridade, Lat/Lng é fallback)
      const query = property.plus_code
        ? encodeURIComponent(property.plus_code) // Codifica caracteres especiais (espaços, +, etc)
        : `${property.latitude},${property.longitude}`;

      // 2. Monta o Link Universal do Google Maps
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

      // 3. Monta a mensagem bonita
      const message = `📍 *GeoRah - Localização Rural*\n\n` +
        `Propriedade: ${property.nome_propriedade}\n` +
        `CAR: ${property.car_code}\n\n` +
        `Abrir no Maps: ${googleMapsUrl}`;

      // 4. Abre o menu nativo de compartilhamento
      await Share.share({
        message: message,
        // title é usado principalmente no Android como título do dialog
        title: `Localização: ${property.nome_propriedade}`,
      });

    } catch (error) {
      Alert.alert("Erro", "Não foi possível compartilhar.");
    }
  };

  const handleGlobalSearchSelection = (property: Property) => {
    // 1. Limpa a busca e fecha o teclado
    setGlobalSearchQuery('');
    setIsGlobalSearchFocused(false);
    Keyboard.dismiss();

    // 2. Foca o mapa na propriedade encontrada
    const propId = property.id ?? property.car_code;

    // Pequeno delay para garantir que a UI limpe antes da animação
    setTimeout(() => {
      setSelectedMarkerId(propId); // Seleciona o pino (faz aparecer o painel inferior)

      if (mapViewRef.current) {
        mapViewRef.current.animateToRegion({
          latitude: property.latitude,
          longitude: property.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      }
    }, 100);
  };

  // Funções de Desenho
  const startDrawing = () => { /* ... (código igual anterior) ... */ };
  const finishDrawing = async () => { /* ... (código igual anterior) ... */ };
  const cancelDrawing = () => { /* ... (código igual anterior) ... */ };
  const handleCancelConfirmation = () => { /* ... (código igual anterior) ... */ };

  const fetchAlerts = useCallback(async () => {
    if (!currentRegion) return;

    try {
      const response = await axios.get(`${API_URL}/alerts`, {
        params: {
          lat: currentRegion.latitude,
          lng: currentRegion.longitude,
          radius: 50 // Raio de 50km
        }
      });
      setMapAlerts(response.data);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
    }
  }, [currentRegion]);

  // Polling: Busca alertas a cada 30 segundos se estiver focado
  useEffect(() => {
    if (isFocused) {
      fetchAlerts(); // Busca inicial
      const interval = setInterval(fetchAlerts, 30 * 1000);
      return () => clearInterval(interval);
    }
  }, [isFocused, fetchAlerts]);

  const handleReportAlert = async (type: AlertType) => {
    if (!userLocation) {
      Alert.alert("Erro", "Localização desconhecida.");
      return;
    }

    setIsReporting(true);
    try {
      await axios.post(`${API_URL}/alerts`, {
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        type
      });

      Alert.alert("Obrigado!", "Seu alerta foi reportado para outros motoristas.");
      setIsAlertModalVisible(false);
      fetchAlerts();
    } catch (error: any) {
      // --- TRATAMENTO DE ERRO ESPECÍFICO (409) ---
      if (error.response && error.response.status === 409) {
        Alert.alert("Alerta Existente", "Alguém já reportou este problema neste local recentemente. Obrigado por confirmar!");
        setIsAlertModalVisible(false); // Fecha o modal mesmo assim, pois a intenção foi válida
      } else {
        Alert.alert("Erro", "Não foi possível enviar o alerta. Tente novamente.");
      }
    } finally {
      setIsReporting(false);
    }
  };

  // Função para selecionar e enviar foto
  const handlePickImage = async (propertyId: number) => {
    // 1. Pede permissão e abre galeria
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Qualidade média para não pesar o upload
    });

    if (!result.canceled) {
      uploadImage(result.assets[0].uri, propertyId);
    }
  };

  const uploadImage = async (uri: string, propertyId: number) => {
    setIsUploadingPhoto(true);

    // 2. Prepara o formulário (FormData) para envio de arquivo
    const formData = new FormData();
    const filename = uri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename || '');
    const type = match ? `image/${match[1]}` : `image`;

    // O React Native exige esse formato específico para arquivos
    formData.append('photo', { uri, name: filename, type } as any);

    try {
      const response = await axios.post(`${API_URL}/properties/${propertyId}/photo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data', // Obrigatório para arquivos
          Authorization: `Bearer ${authToken}`
        }
      });

      Alert.alert("Sucesso", "Foto da propriedade atualizada!");

      // 3. Atualiza os dados locais para a foto aparecer na hora
      fetchProperties();
      fetchAllPublicMarkers(true);

    } catch (error) {
      console.error("Erro upload:", error);
      Alert.alert("Erro", "Falha ao enviar a imagem.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };
  // ----- Renderização -----

const propertiesToRender = useMemo(() => {
    if (!currentRegion) return [];

    const zoom = currentRegion.latitudeDelta;
    
    // Verifica os níveis de zoom
    const canShowPolygons = zoom < POLYGON_VISIBILITY_ZOOM_THRESHOLD;
    const canShowMarkers = zoom < MARKER_VISIBILITY_ZOOM_THRESHOLD;
    const hasActiveRoute = routes.length > 0;

    // 1. TRAVA GLOBAL: Se estiver longe, sem rota e sem permissão de zoom, limpa tudo.
    if (!canShowPolygons && !canShowMarkers && !hasActiveRoute) {
      return [];
    }

    // 2. FILTRAGEM
    return mapProperties.filter(prop => {
      const propId = prop.id ?? prop.car_code;
      
      // Regra 1: O Marcador Selecionado SEMPRE aparece (para o painel não fechar/bugar)
      if (String(selectedMarkerId) === String(propId)) return true;

      // --- CORREÇÃO AQUI ---
      // Regra 2: MODO ROTA (Exclusivo)
      if (hasActiveRoute) {
         const isOrigin = String(propId) === String(routeOriginId);
         const isDest = String(propId) === String(routeDestinationId);
         
         // Se for Origem ou Destino, mostra.
         // Se não for, ESCONDE IMEDIATAMENTE (não deixa cair na regra de baixo)
         return isOrigin || isDest;
      }
      
      // Regra 3: MODO PADRÃO (Exploração)
      // Só executa se NÃO tiver rota ativa
      return isMarkerVisible({ latitude: prop.latitude, longitude: prop.longitude }, currentRegion);
    });

  }, [mapProperties, currentRegion, routes, routeOriginId, routeDestinationId, selectedMarkerId]);

  if (!initialMapRegion) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={{ marginTop: 10, color: '#666' }}>Buscando sua localização GPS...</Text>
      </View>
    );
  }

  // ----- Renderização -----
  return (
    <View style={styles.container}>
      <MapView
        ref={mapViewRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialMapRegion} // Garante que inicia na localização carregada
        showsUserLocation={true}         // Ativa a bolinha nativa do Google
        showsMyLocationButton={false}    // Esconde o botão nativo (pois você tem o seu)
        mapPadding={{ top: 20, right: 20, bottom: 20, left: 20 }}
        onPress={handleMapPress}
        onRegionChangeComplete={(region: Region) => {
          setCurrentRegion(region);
          if (filterMode === 'all') {
            fetchViewportBoundaries(region);
          }
        }}
      >

        {/* --- RENDERIZAÇÃO DOS ALERTAS (SÓ NA ROTA) --- */}
        {routes.length > 0 && clusteredAlerts.map((cluster, index) => {
          const mainAlert = cluster[0];
          const config = ALERT_CONFIG[mainAlert.type];
          const count = cluster.length;

          return (
            <Marker
              key={`alert-${index}`}
              coordinate={{ latitude: mainAlert.lat, longitude: mainAlert.lng }}
              zIndex={200}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => setSelectedClusterAlerts(cluster)}
              tracksViewChanges={true}
            >
              {/* Container transparente para alinhar */}
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>

                {/* 1. Ícone Principal */}
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: config.color,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: 'white',
                  elevation: 2, // Elevação menor (fica atrás)
                  shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2,
                  zIndex: 1
                }}>
                  <FontAwesome name={config.icon as any} size={14} color="white" />
                </View>

                {/* 2. Badge Contador (CORRIGIDO) */}
                {count > 1 && (
                  <View style={{
                    position: 'absolute',
                    top: -4,   // Sobe um pouco para fora do ícone
                    right: -4, // Vai para a direita para fora do ícone
                    backgroundColor: '#D32F2F', // Vermelho vivo
                    borderRadius: 10, // Bem redondo
                    minWidth: 22, // Largura mínima garantida
                    height: 20,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 2,
                    borderColor: 'white',
                    elevation: 10, // <--- O SEGREDO: Elevação bem maior que a do ícone
                    zIndex: 10     // <--- Garante que fica na frente no iOS
                  }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                      {count}
                    </Text>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}

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
{propertiesToRender.map((prop) => {
             // 1. Definições
             const propId = prop.id ?? prop.car_code ?? `${prop.latitude}_${prop.longitude}`;
             const isSelected = String(selectedMarkerId) === String(propId);
             const isOwner = userPropertyIds.has(prop.id);
             
             // --- AQUI ESTÁ A MÁGICA ---
             // Verifica se esta propriedade faz parte da rota ativa (Origem ou Destino)
             const isRoutePoint = routes.length > 0 && (
                String(propId) === String(routeOriginId) || 
                String(propId) === String(routeDestinationId)
             );

             // 2. Regras de Visibilidade
             const zoom = currentRegion!.latitudeDelta;
             
             // Regra Polígono: Mostra se o zoom for médio OU se for ponto da rota (ignora zoom)
             const shouldShowPolygon = isRoutePoint || (zoom < POLYGON_VISIBILITY_ZOOM_THRESHOLD);
             
             // Regra Marcador: Mostra se o zoom for perto OU Selecionado OU ponto da rota (ignora zoom)
             const shouldShowMarker = isRoutePoint || isSelected || (zoom < MARKER_VISIBILITY_ZOOM_THRESHOLD);

             // 3. Preparação de Dados
             const coord = { latitude: prop.latitude, longitude: prop.longitude };
             
             // Busca boundary
             let boundaryData = visibleBoundaries[prop.id];
             if (!boundaryData && prop.boundary) boundaryData = prop.boundary;
             
             // Processa geometria
             const polygonCoords = (shouldShowPolygon && boundaryData)
                ? parseBoundaryToLatLng(boundaryData, String(prop.car_code))
                : [];

             // Cores
             const markerColor = isOwner ? "blue" : "green";
             const polygonStrokeColor = isOwner ? "rgba(0, 0, 255, 0.5)" : "rgba(0, 100, 0, 0.5)";
             const polygonFillColor = isOwner ? "rgba(0, 0, 255, 0.15)" : "rgba(0, 100, 0, 0.15)";

             return (
                <React.Fragment key={propId}>
                  
                  {shouldShowMarker && (
                      <Marker
                        identifier={propId.toString()}
                        coordinate={coord}
                        pinColor={markerColor}
                        title={String(prop.nome_propriedade ?? "Propriedade")}
                        description={prop.plus_code || "Sem código"}
                        zIndex={isSelected || isRoutePoint ? 10 : 1} // Rota/Selecionado sempre no topo
                        draggable={isOwner} 
                        // Performance: Rota e Selecionado podem atualizar, os outros ficam estáticos
                        tracksViewChanges={isSelected || isRoutePoint} 
                        onPress={(e) => { e.stopPropagation(); handleMarkerPress(prop); }}
                      />
                  )}

                  {shouldShowPolygon && polygonCoords.length > 2 && (
                    <Polygon
                      coordinates={polygonCoords}
                      strokeColor={polygonStrokeColor}
                      fillColor={polygonFillColor}
                      // Destaque visual: Se for rota, borda mais grossa (3), senão normal (1.5)
                      strokeWidth={isRoutePoint ? 3 : 1.5} 
                      tappable
                      onPress={(e) => { e.stopPropagation(); handleMarkerPress(prop); }}
                    />
                  )}
                </React.Fragment>
             );
        })}

        {/* RENDERIZA AS LINHAS DA ROTA */}
        {routes.map((route, index) => {
          const isSelected = index === selectedRouteIndex;
          return (
            <Polyline
              // MUDANÇA AQUI: A key muda quando seleciona, forçando a atualização da cor
              key={`${index}-${isSelected ? 'selected' : 'unselected'}`}
              coordinates={route.path}
              // Rota Selecionada = Laranja (#FF5722) | Não Selecionada = Cinza (#90A4AE)
              strokeColor={isSelected ? "#FF5722" : "#90A4AE"}
              // Rota Selecionada é mais grossa
              strokeWidth={isSelected ? 6 : 5}
              // Rota Selecionada fica por cima
              zIndex={isSelected ? 100 : 90}
              tappable={true}
              onPress={() => setSelectedRouteIndex(index)} // Clicar na linha também seleciona
            />
          );
        })}
      </MapView>

      {/* --- BARRA DE PESQUISA FLUTUANTE (GLOBAL) --- */}
      {!isRouteListVisible && routes.length === 0 && (
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBarInputContainer}>
            <FontAwesome name="search" size={20} color="#666" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchBarInput}
              placeholder="Buscar propriedade ou CAR..."
              placeholderTextColor="#999"
              value={globalSearchQuery}
              onChangeText={setGlobalSearchQuery}
              onFocus={() => setIsGlobalSearchFocused(true)}
              onBlur={() => {
                // Pequeno delay para permitir o clique na lista antes de fechar
                setTimeout(() => setIsGlobalSearchFocused(false), 200);
              }}
            />
            {globalSearchQuery.length > 0 && (
              <Pressable onPress={() => { setGlobalSearchQuery(''); Keyboard.dismiss(); }}>
                <FontAwesome name="times-circle" size={20} color="#999" />
              </Pressable>
            )}
          </View>

          {/* LISTA DE RESULTADOS (Dropdown) */}
          {isGlobalSearchFocused && globalSearchResults.length > 0 && (
            <View style={styles.searchResultsContainer}>
              <FlatList
                data={globalSearchResults} // Usa a lista que já tem paginação no useMemo
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"

                // 1. Paginação Infinita na Barra
                onEndReached={() => setListLimit(prev => prev + 20)}
                onEndReachedThreshold={0.5}

                // 2. Loading no final
                ListFooterComponent={
                  globalSearchResults.length >= listLimit ? (
                    <ActivityIndicator size="small" color="#999" style={{ marginVertical: 10 }} />
                  ) : null
                }

                // 3. Renderização dos Itens
                renderItem={({ item }) => {
                  const isMine = userPropertyIds.has(item.id);
                  const iconColor = isMine ? '#2196F3' : '#4CAF50';
                  const iconName = isMine ? "home" : "map-marker";

                  return (
                    <Pressable
                      style={styles.searchResultItem}
                      onPress={() => handleGlobalSearchSelection(item)}
                    >
                      <View style={[styles.searchResultIcon, { backgroundColor: iconColor }]}>
                        <FontAwesome name={iconName} size={16} color="#FFF" />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchResultTitle}>{item.nome_propriedade}</Text>
                        <Text style={styles.searchResultSubtitle}>
                          {isMine ? "Minha Propriedade" : item.car_code}
                        </Text>
                      </View>
                      <FontAwesome name="search" size={14} color="#ccc" />
                    </Pressable>
                  );
                }}
              />
            </View>
          )}
        </View>
      )}

      {/* --- 1. PAINEL DE DETALHES (ESTILO GOOGLE MAPS / AIRBNB) --- */}
      {selectedMarkerId && routes.length === 0 && (
        <View style={styles.bottomSheetContainer}>

          {(() => {
            const selectedProp = mapProperties.find(p => (p.id ?? p.car_code) === selectedMarkerId);
            if (!selectedProp) return <ActivityIndicator color="#007BFF" style={{ margin: 20 }} />;

            const isOwner = userPropertyIds.has(selectedProp.id);

            return (
              <>
                {/* 1. IMAGEM GRANDE NO TOPO (CLICÁVEL PARA ZOOM) */}
                <Pressable
                  style={styles.bigImagePlaceholder}
                  onPress={() => {
                    if (selectedProp.photo_url) setIsFullScreenImageVisible(true);
                  }}
                >

                  {selectedProp.photo_url ? (
                    <Image
                      source={{ uri: `${API_URL}/${selectedProp.photo_url}` }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    // Placeholder estático (sem texto de "toque para editar")
                    <>
                      <FontAwesome name="image" size={40} color="#ccc" />
                      <Text style={{ color: '#999', marginTop: 8, fontSize: 12 }}>
                        Sem foto disponível
                      </Text>
                    </>
                  )}

                  {/* Botão Fechar do Painel (X) */}
                  <Pressable
                    onPress={() => setSelectedMarkerId(null)}
                    style={styles.closeButtonFloating}
                  >
                    <FontAwesome name="times" size={16} color="#555" />
                  </Pressable>

                  {/* Ícone de Zoom (Lupa) se tiver foto - Dica visual */}
                  {selectedProp.photo_url && (
                    <View style={styles.zoomIconBadge}>
                      <FontAwesome name="search-plus" size={14} color="white" />
                    </View>
                  )}
                </Pressable>

                {/* 2. CONTEÚDO (TEXTOS E BOTÕES) */}
                <View style={styles.sheetContent}>

                  {/* Alça visual pequena */}
                  <View style={styles.bottomSheetHandle} />

                  <View style={{ marginBottom: 20 }}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {selectedProp.nome_propriedade}
                    </Text>
                    <Text style={styles.sheetSubtitle}>CAR: {selectedProp.car_code}</Text>
                    {selectedProp.plus_code && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <FontAwesome name="map-marker" size={12} color="#1A73E8" style={{ marginRight: 4 }} />
                        <Text style={styles.sheetMeta}>{selectedProp.plus_code}</Text>
                      </View>
                    )}
                  </View>

                  {/* --- AÇÕES --- */}
                  <View style={styles.sheetActions}>

                    {/* Botão 1: ROTAS (Azul) */}
                    <Pressable
                      style={[styles.sheetActionButton, { backgroundColor: '#4285F4' }]}
                      onPress={() => setIsRouteListVisible(true)}
                    >
                      <FontAwesome name="map-signs" size={18} color="white" />
                      <Text style={[styles.sheetActionText, { color: 'white' }]}>Traçar Rotas</Text>
                    </Pressable>

                    {/* Botão 2: ENVIAR / COMPARTILHAR (Cinza) - AGORA PARA TODOS */}
                    <Pressable
                      style={[styles.sheetActionButton, { backgroundColor: '#F1F3F4' }]}
                      // Chama a função de compartilhar direto, sem verificar se é dono
                      onPress={() => handleShareProperty(selectedProp)}
                    >
                      <FontAwesome name="share-alt" size={18} color="#3C4043" />
                      <Text style={[styles.sheetActionText, { color: '#3C4043' }]}>
                        Enviar
                      </Text>
                    </Pressable>

                  </View>
                </View>
              </>
            );
          })()}
        </View>
      )}

      {/* --- 2. CARD DE INFORMAÇÕES DA ROTA (COM SELETOR) --- */}
      {routes.length > 0 && currentRoute && (
        <View style={[styles.routeInfoCard,
        // Borda colorida baseada no alerta (se houver)
        currentRoute.alert
          ? {
            borderColor: currentRoute.alert.severity === 'HIGH' ? '#FFCDD2'
              : currentRoute.alert.severity === 'MEDIUM' ? '#FFF9C4'
                : '#C8E6C9',
            borderWidth: 2
          }
          : {}
        ]}>
          <View style={{ flex: 1 }}>

            {/* --- SELETOR DE ROTAS (CORRIGIDO PARA LARGURA TOTAL) --- */}
            <View style={{ marginBottom: 10 }}>
              {routes.length > 1 ? (
                // CASO A: TEM ALTERNATIVA (Mostra botões expandidos)
                <View style={{
                  flexDirection: 'row',
                  backgroundColor: '#f0f0f0',
                  borderRadius: 8,
                  padding: 4,
                  width: '100%', // <--- MUDANÇA 1: Ocupa tudo
                  // alignSelf removido
                }}>
                  {routes.map((_, index) => {
                    const isActive = selectedRouteIndex === index;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => setSelectedRouteIndex(index)}
                        style={{
                          flex: 1, // <--- MUDANÇA 2: Divide o espaço igualmente
                          alignItems: 'center', // Centraliza o texto
                          paddingVertical: 8,   // Mais altura para o toque
                          backgroundColor: isActive ? 'white' : 'transparent',
                          borderRadius: 6,
                          elevation: isActive ? 2 : 0,
                          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 1
                        }}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontWeight: 'bold',
                          color: isActive ? '#FF5722' : '#999'
                        }}>
                          {index === 0 ? "Principal" : "Alternativa"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                // CASO B: SÓ TEM UMA ROTA
                <View style={{
                  backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4,
                  borderRadius: 4, alignSelf: 'flex-start'
                }}>
                  <Text style={{ fontSize: 11, color: '#1976D2', fontWeight: 'bold' }}>ROTA PRINCIPAL</Text>
                </View>
              )}
            </View>

            {/* BARRA DE CLIMA */}
            {currentRoute.alert && (
              <View style={{
                flexDirection: 'row',
                backgroundColor: currentRoute.alert.severity === 'HIGH' ? '#FFEBEE'
                  : currentRoute.alert.severity === 'MEDIUM' ? '#FFFDE7'
                    : '#E8F5E9',
                padding: 8, borderRadius: 6, marginBottom: 10, alignItems: 'center'
              }}>
                <FontAwesome
                  name={currentRoute.alert.severity === 'LOW' ? 'sun-o' : 'exclamation-triangle'}
                  size={14}
                  color={currentRoute.alert.severity === 'HIGH' ? '#D32F2F' : currentRoute.alert.severity === 'MEDIUM' ? '#FBC02D' : '#2E7D32'}
                  style={{ marginRight: 6 }}
                />
                <Text style={{
                  color: currentRoute.alert.severity === 'HIGH' ? '#C62828' : currentRoute.alert.severity === 'MEDIUM' ? '#F57F17' : '#1B5E20',
                  fontSize: 12, fontWeight: 'bold', flex: 1
                }}>
                  {currentRoute.alert.title}
                </Text>
              </View>
            )}

            {/* DADOS DA ROTA (Tempo e Distância) */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#333', marginRight: 8 }}>
                {currentRoute.duration}
              </Text>
              <Text style={{ fontSize: 16, color: '#666', fontWeight: '500' }}>
                ({currentRoute.formattedDistance})
              </Text>
            </View>

            {/* DESCRIÇÃO DO CLIMA */}
            {currentRoute.alert && (
              <Text style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic', color: currentRoute.alert.severity === 'LOW' ? '#388E3C' : '#D32F2F' }}>
                {currentRoute.alert.description}
              </Text>
            )}

          </View>

          {/* BOTÃO FECHAR */}
          <Pressable
            onPress={() => {
              setRoutes([]);
              setRouteDestinationId(null);
              setSelectedRouteIndex(0);
              setSelectedMarkerId(null);
              setRouteOriginId(null);
            }}
            style={{ marginLeft: 20, padding: 5 }}
          >
            <FontAwesome name="times-circle" size={36} color="#d9534f" />
          </Pressable>
        </View>
      )}

      {/* Botão GPS */}
      <Pressable style={styles.gpsButton} onPress={() => {
        if (userLocation && mapViewRef.current) {
          mapViewRef.current.animateToRegion({
            ...userLocation,
            latitudeDelta: 0.005, // Zoom consistente com o inicial
            longitudeDelta: 0.005
          }, 1000);
        } else { Alert.alert("Localização", "Não foi possível obter sua localização."); }
      }}>
        <FontAwesome name="location-arrow" size={24} color="white" />
      </Pressable>

      {routes.length > 0 && (
        <Pressable
          style={[styles.gpsButton, { bottom: 110, backgroundColor: '#FFC107' }]} // Acima do botão GPS e Amarelo
          onPress={() => setIsAlertModalVisible(true)}
        >
          <FontAwesome name="exclamation-triangle" size={22} color="black" />
        </Pressable>
      )}

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
      {/* --- 3. MODAL DE SELEÇÃO DE DESTINO/ORIGEM --- */}
      <Modal
        visible={isRouteListVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsRouteListVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* AQUI ESTÁ O SEGREDO: height: '80%' força o modal a ter tamanho */}
          <View style={[styles.modalContent, { height: '80%', width: '95%' }]}>

            <View style={{ width: '100%', borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10, marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center' }}>
                Definir Rota
              </Text>
              <Text style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
                {isSelectedOwner
                  ? "Saindo da sua propriedade (ou indo para ela)"
                  : "Indo para esta propriedade"}
              </Text>
            </View>

            {/* --- OPÇÃO 1: GPS (SEMPRE VISÍVEL NO TOPO) --- */}
            <Pressable
              style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9',
                padding: 15, borderRadius: 8, marginBottom: 15, width: '100%',
                borderWidth: 1, borderColor: '#C8E6C9'
              }}
              // Ação: Do GPS -> Para a propriedade selecionada
              onPress={() => handleTraceRoute(null, 'GPS_TO_PROP')}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <FontAwesome name="location-arrow" size={20} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#2E7D32' }}>
                  Usar minha Localização (GPS)
                </Text>
                <Text style={{ fontSize: 12, color: '#555' }}>
                  Traçar rota: <Text style={{ fontWeight: 'bold' }}>GPS</Text> ➔ <Text style={{ fontWeight: 'bold' }}>Esta Propriedade</Text>
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#4CAF50" />
            </Pressable>

            {/* --- DIVISÓRIA --- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#ddd' }} />
              <Text style={{ marginHorizontal: 10, color: '#999', fontSize: 12, fontWeight: 'bold' }}>
                OU ENTRE PROPRIEDADES
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#ddd' }} />
            </View>

            {/* BARRA DE PESQUISA */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5',
              borderRadius: 8, paddingHorizontal: 10, marginBottom: 5, height: 45, width: '100%'
            }}>
              <FontAwesome name="search" size={16} color="#999" style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: '#333' }}
                placeholder={isSelectedOwner ? "Buscar destino (vizinhos)..." : "Buscar origem (suas)..."}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <FontAwesome name="times-circle" size={18} color="#999" />
                </Pressable>
              )}
            </View>

            <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 10, alignSelf: 'flex-start' }}>
              {filteredDestinations.length} propriedades disponíveis na lista
            </Text>

            {/* --- LISTA (DROPDOWN) --- */}
            <FlatList
              data={filteredDestinations}
              keyExtractor={(item) => String(item.id || item.car_code)}
              style={{ flex: 1, width: '100%' }} // Flex 1 preenche o resto do modal
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={10}

              renderItem={({ item }) => (
                <Pressable
                  style={{
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
                    flexDirection: 'row', alignItems: 'center'
                  }}
                  onPress={() => handleTraceRoute(item.id)}
                >
                  <View style={{ backgroundColor: '#FFF3E0', padding: 8, borderRadius: 6, marginRight: 12 }}>
                    <FontAwesome name="home" size={20} color="#FF9800" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#333' }}>
                      {item.nome_propriedade}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>
                      {isSelectedOwner ? "Ir para cá" : "Sair daqui"} • {item.car_code}
                    </Text>
                  </View>
                  <FontAwesome name="chevron-right" size={12} color="#ccc" />
                </Pressable>
              )}

              ListEmptyComponent={
                <View style={{ marginTop: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#999' }}>Nenhuma propriedade encontrada.</Text>
                </View>
              }
            />
            {/* Botão Cancelar */}
            <Pressable
              style={{
                marginTop: 15,
                paddingVertical: 12,
                width: '100%',
                alignItems: 'center',
                borderTopWidth: 1,
                borderColor: '#eee' // Uma linhazinha separadora sutil
              }}
              onPress={() => {
                setIsRouteListVisible(false);
                setSearchQuery('');
              }}
            >
              <Text style={{ color: '#757575', fontWeight: '600', fontSize: 16 }}>
                Cancelar
              </Text>
            </Pressable>

          </View>
        </View>
      </Modal>
      <Modal
        visible={isAlertModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAlertModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { width: '85%' }]}>
            <Text style={styles.modalTitle}>Relatar Problema na Via</Text>
            <Text style={{ marginBottom: 20, color: '#666', textAlign: 'center' }}>
              O que você encontrou? Isso ajudará outros motoristas.
            </Text>

            {/* Lista de Opções */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {(Object.keys(ALERT_CONFIG) as AlertType[]).map((type) => (
                <Pressable
                  key={type}
                  style={{
                    width: '48%',
                    backgroundColor: '#f9f9f9',
                    padding: 15,
                    borderRadius: 8,
                    marginBottom: 10,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#eee'
                  }}
                  onPress={() => handleReportAlert(type)}
                  disabled={isReporting}
                >
                  <FontAwesome name={ALERT_CONFIG[type].icon as any} size={24} color={ALERT_CONFIG[type].color} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>{ALERT_CONFIG[type].label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.button, styles.cancelButton, { marginTop: 10, width: '100%' }]}
              onPress={() => setIsAlertModalVisible(false)}
            >
              <Text style={styles.buttonText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!selectedClusterAlerts}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedClusterAlerts(null)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { maxHeight: '60%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.modalTitle}>Alertas neste local</Text>
              <Pressable onPress={() => setSelectedClusterAlerts(null)}>
                <FontAwesome name="times" size={24} color="#666" />
              </Pressable>
            </View>

            <FlatList
              data={selectedClusterAlerts || []}
              keyExtractor={(item) => item.id}
              style={{ width: '100%' }}
              renderItem={({ item }) => {
                const config = ALERT_CONFIG[item.type];
                const minutesAgo = Math.round((Date.now() - item.timestamp) / 60000);
                return (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee'
                  }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 12
                    }}>
                      <FontAwesome name={config.icon as any} size={20} color={config.color} />
                    </View>
                    <View>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#333' }}>{config.label}</Text>
                      <Text style={{ color: '#666', fontSize: 12 }}>Reportado há {minutesAgo} min</Text>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* --- MODAL DE IMAGEM EM TELA CHEIA --- */}
      <Modal
        visible={isFullScreenImageVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsFullScreenImageVisible(false)}
      >
        <View style={styles.fullScreenContainer}>
          {/* Botão Fechar Grande */}
          <Pressable
            style={styles.fullScreenCloseButton}
            onPress={() => setIsFullScreenImageVisible(false)}
          >
            <FontAwesome name="times" size={24} color="white" />
          </Pressable>

          {/* A Imagem */}
          {(() => {
            const prop = mapProperties.find(p => (p.id ?? p.car_code) === selectedMarkerId);
            if (prop?.photo_url) {
              return (
                <Image
                  source={{ uri: `${API_URL}/${prop.photo_url}` }}
                  style={{ width: '100%', height: '80%' }}
                  resizeMode="contain" // Garante que a foto inteira apareça sem cortes
                />
              );
            }
            return null;
          })()}
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
    top: 120, // Ou um valor fixo se preferir
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
  },

  // --- NOVOS ESTILOS PARA O MARCADOR DA LOCALIZAÇÃO ATUAL DO USER ---
  userLocationContainer: {
    width: 60, // Área total do toque/visualização
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userLocationRing: {
    position: 'absolute',
    width: 40, // Tamanho do "brilho" em volta
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 123, 255, 0.25)', // Azul bem transparente
    zIndex: 1,
  },

  // O ponto central sólido (igual ao anterior, mas sem posição absoluta)
  userLocationDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#007BFF', // Azul sólido
    borderWidth: 3,
    borderColor: 'white', // Borda branca

    // Sombra para dar um "pop" (opcional, mas fica bonito)
    elevation: 4, // Android
    shadowColor: "#000", // iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  // ... outros estilos ...

  // BARRA DE PESQUISA GLOBAL
  searchBarContainer: {
    position: 'absolute',
    top: (Constants.statusBarHeight || 40) + 10, // Logo abaixo da status bar
    left: 20,
    right: 20,
    zIndex: 100, // Acima de tudo
  },
  searchBarInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 15,
    height: 50,
    elevation: 5, // Sombra Android
    shadowColor: '#000', // Sombra iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  searchResultsContainer: {
    marginTop: 5,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    maxHeight: 250, // Limita altura da lista
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchResultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF5722', // Laranja do tema
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  searchResultTitle: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: 14,
  },
  searchResultSubtitle: {
    color: '#888',
    fontSize: 12,
  },
  // Adicione ao final do styles
  gpsOptionButton: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EEEEEE'
  },
  gpsIconCircle: {
    padding: 8,
    borderRadius: 20,
    marginRight: 15,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center'
  },
  gpsOptionTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#333'
  },
  gpsOptionSubtitle: {
    color: '#777',
    fontSize: 11
  },
  // --- ESTILOS DO BOTTOM SHEET ---
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // SEM PADDING AQUI para a imagem encostar nas bordas
    elevation: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10,
    zIndex: 1000,
    overflow: 'hidden', // Garante que a imagem respeite o arredondamento do topo
  },
  // Imagem Grande
  bigImagePlaceholder: {
    width: '100%',
    height: 150, // Altura fixa para a área da foto
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#f0f0f0'
  },
  // Botão X flutuante sobre a imagem
  closeButtonFloating: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'white',
    width: 30, height: 30,
    borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    elevation: 3,
    zIndex: 2
  },
  // Área de texto e botões (com padding)
  sheetContent: {
    padding: 20,
    paddingTop: 10,
  },
  bottomSheetHandle: {
    width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 15,
  },
  sheetTitle: {
    fontSize: 20, fontWeight: 'bold', color: '#202124', marginBottom: 2,
  },
  sheetSubtitle: {
    fontSize: 14, color: '#5F6368',
  },
  sheetMeta: {
    fontSize: 13, color: '#1A73E8', fontWeight: '500'
  },
  sheetActions: {
    flexDirection: 'row', gap: 12,
  },
  sheetActionButton: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 24, gap: 8,
    elevation: 1,
  },
  sheetActionText: {
    fontSize: 15, fontWeight: '600', color: 'white',
  },

  // --- ESTILOS DE IMAGEM E ZOOM ---
  zoomIconBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 4,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 40, // Ajuste para StatusBar
    right: 20,
    padding: 10,
    zIndex: 10,
  },
});



