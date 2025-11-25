// app/(tabs)/properties.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, TextInput, Modal, Image, LogBox } from 'react-native';
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
import * as ImagePicker from 'expo-image-picker'; // <--- Importe o ImagePicker

LogBox.ignoreLogs([
  'ImagePicker.MediaTypeOptions', // Ignora o aviso específico do ImagePicker
]);

const API_URL = "http://10.0.2.2:3000";

export default function PropertiesScreen() {
  const { authToken } = useAuth();
  const { properties, isLoading, fetchProperties } = useProperties();
  const { focusOnLocation } = useMap();
  const router = useRouter();
  const isFocused = useIsFocused();
  
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  
  // Estados de Edição
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [newName, setNewName] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false); // Novo estado para loading da foto

  useEffect(() => {
    if (isFocused) fetchProperties();
  }, [fetchProperties, isFocused]);

  const handleViewOnMap = (latitude: number, longitude: number) => {
    focusOnLocation({ latitude, longitude });
    router.push('/');
  };


const handleUpdatePhoto = async () => {
    if (!editingProperty) return;

    try {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, 
            aspect: [4, 3],
            quality: 0.5,
        });

        if (result.canceled) return;

        const asset = result.assets[0];
        
        // Validação de Tamanho
        const FIVE_MB = 5 * 1024 * 1024;
        if (asset.fileSize && asset.fileSize > FIVE_MB) {
            Alert.alert("Arquivo muito grande", "Por favor, escolha uma imagem menor que 5MB.");
            return;
        }

        setIsUploadingPhoto(true);
        const localUri = asset.uri;

        // --- CORREÇÃO FINAL DO UPLOAD/MIME TYPE ---
        
        // 1. Pega o nome do arquivo ou gera um nome seguro
        let filename = localUri.split('/').pop() || `upload_${Date.now()}`;
        
        // 2. Garante que sempre terá uma extensão e um tipo MIME válido
        const typeMatch = /\.(\w+)$/.exec(filename);
        const mimeType = typeMatch ? `image/${typeMatch[1].toLowerCase()}` : 'image/jpeg';
        
        // Se o nome do arquivo temporário não tiver extensão (comum em arquivos editados/cortados), adicionamos .jpeg
        if (!filename.includes('.')) {
            filename = `${filename}.jpeg`;
        }
        // ------------------------------------------

        const formData = new FormData();
        
        // @ts-ignore
        formData.append('photo', { 
            uri: localUri, 
            name: filename, // Nome do arquivo garantido com extensão
            type: mimeType // Tipo MIME garantido
        } as any);

        const response = await axios.post(`${API_URL}/properties/${editingProperty.id}/photo`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                Authorization: `Bearer ${authToken}`
            },
            timeout: 20000,
        });

        // Sucesso e Atualização de Listas
        await fetchProperties();
        
        // Atualiza o objeto local do modal
        const updatedList = await axios.get(`${API_URL}/properties`, { headers: { Authorization: `Bearer ${authToken}` } });
        const updatedProp = updatedList.data.find((p: Property) => p.id === editingProperty.id);
        if (updatedProp) setEditingProperty(updatedProp);

        Alert.alert("Sucesso", "Foto atualizada!");

    } catch (error: any) {
        console.error("Erro upload:", error);
        const msg = error.message === 'Network Error' 
            ? "Falha no envio! Verifique o servidor/conexão ou tente uma imagem menor."
            : "Falha ao enviar a imagem.";
        Alert.alert("Erro", msg);
    } finally {
        setIsUploadingPhoto(false);
    }
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
        return;
      }

      await Sharing.shareAsync(uri, { dialogTitle: 'Abrir ou Salvar Certificado', mimeType: 'application/pdf' });
    } catch (error: any) {
      Alert.alert('Erro', 'Não foi possível baixar o certificado.');
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
      await fetchProperties();
      setEditModalVisible(false);
    } catch (error: any) {
      Alert.alert('Erro', 'Não foi possível atualizar o nome.');
    }
  };

  // --- CARD DA PROPRIEDADE (COM FOTO) ---
  const renderPropertyItem = ({ item }: { item: Property }) => (
    <View style={styles.propertyCard}>
      
      {/* IMAGEM DA PROPRIEDADE (NOVO) */}
      <View style={styles.cardImageContainer}>
         {item.photo_url ? (
            <Image 
                source={{ uri: `${API_URL}/${item.photo_url}` }} 
                style={styles.cardImage} 
                resizeMode="cover"
            />
         ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
                <FontAwesome name="image" size={40} color="#ccc" />
                <Text style={styles.placeholderText}>Sem foto</Text>
            </View>
         )}
      </View>

      <View style={styles.cardContent}>
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
                  <Text style={styles.buttonText}>PDF</Text>
                </>
              )}
            </Pressable>

            <Pressable style={[styles.button, styles.editButton]} onPress={() => openEditModal(item)}>
              <FontAwesome name="pencil" size={16} color="white" />
              <Text style={styles.buttonText}>Editar</Text>
            </Pressable>
          </View>
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

      {/* Modal para editar */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Propriedade</Text>
            
            {/* --- ÁREA DE EDIÇÃO DE FOTO (NOVO) --- */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Pressable onPress={handleUpdatePhoto} disabled={isUploadingPhoto}>
                    <View style={styles.editPhotoCircle}>
                        {isUploadingPhoto ? (
                            <ActivityIndicator color="#007BFF" />
                        ) : editingProperty?.photo_url ? (
                            <Image 
                                source={{ uri: `${API_URL}/${editingProperty.photo_url}` }} 
                                style={{ width: 100, height: 100, borderRadius: 50 }} 
                            />
                        ) : (
                            <FontAwesome name="camera" size={30} color="#999" />
                        )}
                        
                        {/* Íconezinho de + para indicar edição */}
                        <View style={styles.editIconBadge}>
                            <FontAwesome name="pencil" size={12} color="white" />
                        </View>
                    </View>
                </Pressable>
                <Text style={{ color: '#007BFF', marginTop: 5, fontSize: 14 }}>Alterar Foto</Text>
            </View>

            <Text style={styles.label}>Nome da Propriedade</Text>
            <TextInput 
              style={styles.input} 
              value={newName} 
              onChangeText={setNewName} 
              placeholder="Digite o novo nome" 
            />

            <View style={styles.noteContainer}>
              <FontAwesome name="info-circle" size={16} color="#555" style={{ marginBottom: 5 }} />
              <Text style={styles.noteText}>
                Dica: Para mudar o <Text style={{fontWeight: 'bold'}}>ponto de entrada</Text>, 
                vá ao mapa, pressione e segure o marcador desta propriedade e arraste para o local desejado.
              </Text>
            </View>

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
  // Card Styles Atualizados
  propertyCard: { 
      backgroundColor: 'white', 
      borderRadius: 12, 
      marginBottom: 15, 
      elevation: 3, 
      overflow: 'hidden' // Garante que a imagem obedeça o radius
  },
  cardImageContainer: {
      width: '100%',
      height: 150, // Altura da foto no card
      backgroundColor: '#eee',
  },
  cardImage: {
      width: '100%',
      height: '100%',
  },
  placeholderImage: {
      justifyContent: 'center',
      alignItems: 'center',
  },
  placeholderText: {
      color: '#999',
      marginTop: 5,
      fontSize: 12
  },
  cardContent: {
      padding: 15,
  },
  propertyName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  propertyInfo: { fontSize: 14, color: '#666', marginTop: 2 },
  
  buttonContainer: { flexDirection: 'row', marginTop: 15, justifyContent: 'flex-end' },
  button: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginLeft: 8 },
  viewButton: { backgroundColor: '#007BFF' },
  downloadButton: { backgroundColor: '#17a2b8' },
  editButton: { backgroundColor: '#ffc107' },
  buttonText: { color: 'white', fontWeight: 'bold', marginLeft: 6, fontSize: 12 },
  
  emptyText: { textAlign: 'center', fontSize: 16, marginTop: 50, color: '#666' },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, marginBottom: 15 },
  label: { fontSize: 14, color: '#333', marginBottom: 5, fontWeight: 'bold' },
  
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  saveButton: { backgroundColor: '#28a745', marginRight: 10 },
  cancelButton: { backgroundColor: '#6c757d' },
  
  noteContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center',
  },
  noteText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Estilos da Edição de Foto
  editPhotoCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: '#f0f0f0',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#ddd'
  },
  editIconBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: '#007BFF',
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'white'
  }
});