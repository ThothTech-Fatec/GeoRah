// app/(tabs)/properties.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useProperties, Property } from '../../context/PropertyContext';
import { useMap } from '../../context/MapContext';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import axios from 'axios';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';

const API_URL = "http://10.0.2.2:3000";

export default function PropertiesScreen() {
  const { authToken, user, setUser } = useAuth();
  const { properties, isLoading, fetchProperties } = useProperties();
  const { focusOnLocation } = useMap();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isFocused) fetchProperties();
  }, [fetchProperties, isFocused]);

  const handleViewOnMap = (latitude: number, longitude: number) => {
    focusOnLocation({ latitude, longitude });
    router.push('/');
  };

  const handleDownloadCertificate = async (property: Property) => {
    if (!authToken || !property?.id) return;
    setDownloadingId(property.id);
    try {
      const uri = FileSystem.cacheDirectory + `certificado_${property.nome_propriedade}.pdf`;
      const downloadResult = await FileSystem.downloadAsync(
        `${API_URL}/properties/${property.id}/certificate`,
        uri,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      if (downloadResult.status !== 200) throw new Error(`Erro no servidor: ${downloadResult.status}`);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo.');
        setDownloadingId(null);
        return;
      }

      await Sharing.shareAsync(uri, { dialogTitle: 'Abrir ou Salvar Certificado', mimeType: 'application/pdf' });
    } catch (error: any) {
      Alert.alert('Erro', 'Não foi possível baixar ou abrir o certificado.');
      console.error(error);
    } finally {
      setDownloadingId(null);
    }
  };

  const openEditModal = (property: Property) => {
    setEditingProperty(property);
    setNewName(property.nome_propriedade);
    setEditModalVisible(true);
  };

  const handleSaveName = async () => {
    if (!editingProperty || !newName.trim()) return;

    try {
      await axios.put(`${API_URL}/properties/${editingProperty.id}`, 
        { nome_propriedade: newName.trim() },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );


      // refresh properties list after update
      await fetchProperties();
      setEditModalVisible(false);
    } catch (error: any) {
      Alert.alert('Erro', 'Não foi possível atualizar o nome. Tente novamente.');
      console.error(error);
    }
  };

  const renderPropertyItem = ({ item }: { item: Property }) => (
    <View style={styles.propertyCard}>
      <Text style={styles.propertyName}>{item.nome_propriedade}</Text>
      <Text style={styles.propertyInfo}>CAR: {item.car_code}</Text>
      <Text style={styles.propertyInfo}>Plus Code: {item.plus_code}</Text>
      <View style={styles.buttonContainer}>
        <Pressable style={[styles.button, styles.viewButton]} onPress={() => handleViewOnMap(item.latitude, item.longitude)}>
          <FontAwesome name="map-marker" size={16} color="white" />
          <Text style={styles.buttonText}>Ver</Text>
        </Pressable>

        <Pressable 
          style={[styles.button, styles.downloadButton]} 
          onPress={() => handleDownloadCertificate(item)} 
          disabled={downloadingId === item.id}
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

        <Pressable style={[styles.button, styles.editButton]} onPress={() => openEditModal(item)}>
          <FontAwesome name="pencil" size={16} color="white" />
          <Text style={styles.buttonText}>Editar</Text>
        </Pressable>
      </View>
    </View>
  );

  if (isLoading) return <View style={styles.container}><ActivityIndicator size="large" color="#007BFF" /></View>;

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

{/* Modal para editar o nome */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Nome</Text>
            
            <TextInput 
              style={styles.input} 
              value={newName} 
              onChangeText={setNewName} 
              placeholder="Digite o novo nome" 
            />

            {/* --- NOVO AVISO SOBRE A LOCALIZAÇÃO --- */}
            <View style={styles.noteContainer}>
              <FontAwesome name="info-circle" size={16} color="#555" style={{ marginBottom: 5 }} />
              <Text style={styles.noteText}>
                Dica: Para mudar o <Text style={{fontWeight: 'bold'}}>ponto de entrada</Text>, 
                vá ao mapa, pressione e segure o marcador desta propriedade e arraste para o local desejado.
              </Text>
            </View>
            {/* -------------------------------------- */}

            <View style={styles.modalButtons}>
              <Pressable style={[styles.button, styles.saveButton]} onPress={handleSaveName}>
                <Text style={styles.buttonText}>Salvar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.cancelButton]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f2f2f2' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, marginTop: 30 },
  propertyCard: { backgroundColor: 'white', padding: 20, borderRadius: 10, marginBottom: 15, elevation: 3 },
  propertyName: { fontSize: 20, fontWeight: 'bold' },
  propertyInfo: { fontSize: 16, color: '#555', marginTop: 5 },
  buttonContainer: { flexDirection: 'row', marginTop: 15, justifyContent: 'flex-end' },
  button: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginLeft: 10 },
  viewButton: { backgroundColor: '#007BFF' },
  downloadButton: { backgroundColor: '#17a2b8' },
  editButton: { backgroundColor: '#ffc107' },
  buttonText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },
  emptyText: { textAlign: 'center', fontSize: 16, marginTop: 50, color: '#666' },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  saveButton: { backgroundColor: '#28a745', marginRight: 10 },
  cancelButton: { backgroundColor: '#6c757d' },
  noteContainer: {
    backgroundColor: '#f8f9fa', // Cinza bem clarinho
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center', // Centraliza o ícone e texto
  },
  noteText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18, // Melhora a leitura se quebrar linha
  },
});
