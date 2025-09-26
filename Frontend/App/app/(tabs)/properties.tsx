// app/(tabs)/properties.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { FontAwesome } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native'; // Hook para recarregar a tela

const API_URL = "http://10.0.2.2:3000";

type Property = {
  id: number;
  nome_propriedade: string;
  car_code: string;
  plus_code: string;
};

export default function PropertiesScreen() {
  const { authToken } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isFocused = useIsFocused(); // Verifica se a tela está em foco

  const fetchProperties = async () => {
    if (!authToken) return;
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/properties`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setProperties(response.data);
    } catch (error) {
      Alert.alert("Erro", "Não foi possível carregar suas propriedades.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchProperties();
    }
  }, [isFocused, authToken]); // Recarrega quando a tela fica visível

  const renderPropertyItem = ({ item }: { item: Property }) => (
    <View style={styles.propertyCard}>
      <Text style={styles.propertyName}>{item.nome_propriedade}</Text>
      <Text style={styles.propertyInfo}>CAR: {item.car_code}</Text>
      <Text style={styles.propertyInfo}>Plus Code: {item.plus_code}</Text>
      <View style={styles.buttonContainer}>
        <Pressable style={[styles.button, styles.viewButton]} onPress={() => Alert.alert("A Fazer", "Navegar para o mapa.")}>
          <FontAwesome name="map-marker" size={16} color="white" />
          <Text style={styles.buttonText}>Ver no Mapa</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.deleteButton]} onPress={() => Alert.alert("A Fazer", `Excluir propriedade ${item.id}`)}>
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
    </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f2f2f2',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 30, // Espaço para o topo da tela
  },
  propertyCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
  },
  propertyName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  propertyInfo: {
    fontSize: 16,
    color: '#555',
    marginTop: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 15,
    justifyContent: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 10,
  },
  viewButton: {
    backgroundColor: '#007BFF',
  },
  deleteButton: {
    backgroundColor: '#d9534f',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 50,
    color: '#666',
  },
});