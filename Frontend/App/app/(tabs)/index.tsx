// app/(tabs)/index.tsx
import React, { useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Modal, Pressable, TextInput, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, LatLng, MapPressEvent } from 'react-native-maps';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

const API_URL = "http://10.0.2.2:3000";
const API_KEY = Constants.expoConfig?.extra?.googleApiKey;

export default function MapScreen() {
  const { authToken } = useAuth();

  const [plusCode, setPlusCode] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<LatLng | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [nomePropriedade, setNomePropriedade] = useState("");
  const [codigoCar, setCodigoCar] = useState("");

  const initialCoordinates = {
    latitude: -23.1791,
    longitude: -45.8872,
  };

  const initialRegion = {
    ...initialCoordinates,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

    const getPlusCodeFromCoordinates = async (latitude: number, longitude: number): Promise<string | null> => {
    if (!API_KEY) {
      Alert.alert("Erro", "Chave de API do Google não encontrada.");
      return null;
    }
    setIsLoading(true);
    let foundPlusCode = null;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.plus_code) {
        foundPlusCode = data.plus_code.compound_code || data.plus_code.global_code;
        setPlusCode(foundPlusCode); // Atualiza o estado para exibição
      } else {
        Alert.alert("Erro", "Não foi possível obter o Plus Code para este local.");
      }
    } catch (error) {
      console.error("Erro na busca do Plus Code:", error);
      Alert.alert("Erro", "Erro de conexão ao buscar o Plus Code.");
    } finally {
      setIsLoading(false);
      return foundPlusCode; // Retorna o valor encontrado ou null
    }
  };

  const handleMapPress = (event: MapPressEvent) => {
    const coords = event.nativeEvent.coordinate;
    setPlusCode(null);
    setIsModalVisible(false);
    setClickedLocation(coords);
    setShowConfirmation(true);
  };

  const handleSaveProperty = async () => {
    // 1. Validação dos dados (INCLUINDO PLUS CODE)
    if (!nomePropriedade || !codigoCar) {
      Alert.alert("Erro", "Por favor, preencha o nome da propriedade e o código CAR.");
      return;
    }
    if (!clickedLocation || !plusCode) { // Garante que o plusCode não seja nulo
      Alert.alert("Erro", "Localização ou Plus Code inválidos. Tente selecionar o local novamente.");
      return;
    }

    const propertyData = {
      nome_propriedade: nomePropriedade,
      car_code: codigoCar,
      latitude: clickedLocation.latitude,
      longitude: clickedLocation.longitude,
      plus_code: plusCode,
    };

    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/properties`, propertyData, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      Alert.alert("Sucesso!", "Propriedade registrada com sucesso.");
      setIsModalVisible(false);
      setClickedLocation(null);
      setNomePropriedade("");
      setCodigoCar("");
      setPlusCode(null);
    } catch (error) {
      // eslint-disable-next-line import/no-named-as-default-member
      if (axios.isAxiosError(error) && error.response) {
        Alert.alert("Erro ao Salvar", error.response.data.message || "Não foi possível registrar a propriedade.");
      } else {
        Alert.alert("Erro de Conexão", "Não foi possível conectar ao servidor.");
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onPress={handleMapPress}
      >
        {clickedLocation && (
          <Marker
            coordinate={clickedLocation}
            title="Local Escolhido"
            pinColor="blue"
          />
        )}
      </MapView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registrar Propriedade</Text>
            <Text style={styles.plusCodeText}>Plus Code: {plusCode}</Text>
            <TextInput style={styles.input} placeholder="Nome da Propriedade" value={nomePropriedade} onChangeText={setNomePropriedade} />
            <TextInput style={styles.input} placeholder="Código CAR" value={codigoCar} onChangeText={setCodigoCar} />
            <View style={styles.buttonContainer}>
              <Pressable style={[styles.button, styles.cancelButton]} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.saveButton]} onPress={handleSaveProperty}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Salvar</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {showConfirmation && clickedLocation && (
        <View style={styles.confirmationContainer}>
          <Text style={styles.confirmationText}>Registrar propriedade neste local?</Text>
          <View style={styles.confirmationButtonContainer}>
            <Pressable
              style={[styles.confirmationButton, styles.cancelButton]}
              onPress={() => {
                setShowConfirmation(false);
                setClickedLocation(null);
              }}
            >
              <Text style={styles.buttonText}>Não</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmationButton, styles.saveButton]}
              onPress={async () => {
                setShowConfirmation(false);
                // --- LÓGICA CORRIGIDA AQUI ---
                if (clickedLocation) {
                  const foundPlusCode = await getPlusCodeFromCoordinates(clickedLocation.latitude, clickedLocation.longitude);
                  if (foundPlusCode) {
                    setIsModalVisible(true); // Só abre o modal se o Plus Code for encontrado
                  } else {
                    setClickedLocation(null); // Limpa o marcador se não encontrar o plus code
                  }
                }
              }}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sim</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// Seus estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  plusCodeText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  saveButton: {
    backgroundColor: '#007BFF',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  confirmationContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    elevation: 5,
    zIndex: 2,
  },
  confirmationText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 15,
  },
  confirmationButtonContainer: {
    flexDirection: 'row',
  },
  confirmationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 10,
  }
});