// app/(tabs)/properties.tsx
import React, { useEffect, useState } from 'react'; // Adicione useState
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, Modal, Linking } from 'react-native'; // <-- Adiciona Linking
import { useAuth } from '../../context/AuthContext';
import { useProperties, Property } from '../../context/PropertyContext';
import { useMap } from '../../context/MapContext';
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import axios from 'axios';
import { WebView } from 'react-native-webview'; // Adicione WebView
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy'; // Importa 'cacheDirectory' e 'downloadAsync' diretamente
import * as Sharing from 'expo-sharing';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';

const API_URL = "http://10.0.2.2:3000";

export default function PropertiesScreen() {
  const { authToken } = useAuth();
  const { properties, isLoading, fetchProperties, deleteProperty } = useProperties();
  const { focusOnLocation } = useMap();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [downloadingId, setDownloadingId] = useState<number | null>(null); // NOVO ESTADO

  useEffect(() => {
    if (isFocused) {
      fetchProperties();
    }
  }, [fetchProperties, isFocused]);

  const handleViewOnMap = (latitude: number, longitude: number) => {
    focusOnLocation({ latitude, longitude });
    router.push('/');
  };

  const handleDeleteProperty = (propertyId: number) => {
    Alert.alert(
      "Confirmar Exclusão",
      "Tem certeza de que deseja excluir esta propriedade?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/properties/${propertyId}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              deleteProperty(propertyId); // Notifica o contexto para remover a propriedade
              Alert.alert("Sucesso", "Propriedade excluída com sucesso.");
            } catch (error) {
              // eslint-disable-next-line import/no-named-as-default-member
              if (axios.isAxiosError(error) && error.response) {
                Alert.alert("Erro", error.response.data.message);
              } else {
                Alert.alert("Erro", "Ocorreu um erro de conexão.");
              }
            }
          },
        },
      ]
    );
  };


  const handleDownloadCertificate = async (property: Property) => {
    if (!authToken || !property || !property.id) return;
    setDownloadingId(property.id); // Inicia o loading para este item

    try {
      const uri = FileSystem.cacheDirectory + `certificado_${property.id}.pdf`;
      console.log('Tentando baixar certificado para:', uri);

      const downloadResult = await FileSystem.downloadAsync(
        `${API_URL}/properties/${property.id}/certificate`,
        uri,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      console.log('Download concluído:', downloadResult);

      if (downloadResult.status !== 200) {
        throw new Error(`Erro no servidor: ${downloadResult.status}`);
      }

      // Verifica se o compartilhamento está disponível
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo.');
        setDownloadingId(null);
        return;
      }

      // Abre a opção de compartilhar/visualizar o PDF
      await Sharing.shareAsync(uri, { dialogTitle: 'Abrir ou Salvar Certificado', mimeType: 'application/pdf' });

    } catch (error: any) {
      console.error("Erro ao baixar/compartilhar certificado:", error);
      Alert.alert('Erro', 'Não foi possível baixar ou abrir o certificado. Verifique sua conexão ou tente novamente.');
    } finally {
      setDownloadingId(null); // Finaliza o loading para este item
    }
  };

  const renderPropertyItem = ({ item }: { item: any }) => (
    <View style={styles.propertyCard}>
      <Text style={styles.propertyName}>{item.nome_propriedade}</Text>
      <Text style={styles.propertyInfo}>CAR: {item.car_code}</Text>
      <Text style={styles.propertyInfo}>Plus Code: {item.plus_code}</Text>
      <View style={styles.buttonContainer}>
        {/* Botão Ver no Mapa */}
        <Pressable style={[styles.button, styles.viewButton]} onPress={() => handleViewOnMap(item.latitude, item.longitude)}>
          <FontAwesome name="map-marker" size={16} color="white" />
          <Text style={styles.buttonText}>Ver</Text>
        </Pressable>
        {/* NOVO Botão Download */}
        <Pressable 
          style={[styles.button, styles.downloadButton]} 
          onPress={() => handleDownloadCertificate(item)} 
          disabled={downloadingId === item.id} // Desabilita enquanto baixa
        >
          {downloadingId === item.id ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <FontAwesome name="download" size={16} color="white" />
              <Text style={styles.buttonText}>Download</Text>
            </>
          )}
        </Pressable>

        {/* Botão Excluir */}
        <Pressable style={[styles.button, styles.deleteButton]} onPress={() => handleDeleteProperty(item.id)}>
          <FontAwesome name="trash" size={16} color="white" />
          <Text style={styles.buttonText}>Excluir</Text>
        </Pressable>
      </View>
    </View>
  );

  if (isLoading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#007BFF" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Minhas Propriedades</Text>
      {properties.length === 0 ? (
        <Text style={styles.emptyText}>Você ainda não cadastrou nenhuma propriedade.</Text>
      ) : (
        <FlatList
          data={properties}
          renderItem={renderPropertyItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
  {/* --- FIM DO MODAL --- */}
    </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f2f2f2' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, marginTop: 30 },
  propertyCard: { backgroundColor: 'white', padding: 20, borderRadius: 10, marginBottom: 15, elevation: 3 },
  propertyName: { fontSize: 20, fontWeight: 'bold' },
  propertyInfo: { fontSize: 16, color: '#555', marginTop: 5 },
  buttonContainer: { flexDirection: 'row', marginTop: 15, justifyContent: 'flex-end' },
  button: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginLeft: 10 },
  viewButton: { backgroundColor: '#007BFF' },
  deleteButton: { backgroundColor: '#d9534f' },
  downloadButton: { backgroundColor: '#17a2b8' }, // Cor Ciano/Azul claro
  buttonText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },
  emptyText: { textAlign: 'center', fontSize: 16, marginTop: 50, color: '#666' },
  modalContainer: { 
    flex: 1, 
    marginTop: Constants.statusBarHeight || 0, // Evita sobrepor a status bar
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f8f8f8',
  },
  modalTitleText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  webView: {
    flex: 1,
  },
});