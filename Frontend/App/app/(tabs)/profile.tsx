// app/(tabs)/profile.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { useIsFocused } from '@react-navigation/native'; // Importe o useAuth

const API_URL = "http://10.0.2.2:3000";

// Interface para os dados do perfil
interface UserProfile {
  nome_completo: string;
  email: string;
  cpf: string;
}

export default function ProfileScreen() {
  const { authToken, logout } = useAuth(); // Pegue o token e a função logout
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isFocused = useIsFocused(); // Hook para saber se a tela está visível

  // Busca os dados do perfil quando a tela carrega ou volta a ter foco
  useEffect(() => {
    const fetchProfile = async () => {
      if (!authToken || authToken === 'guest-token') {
        // Se for convidado, não busca perfil real
        setProfileData({ nome_completo: 'Convidado', email: '-', cpf: '-' });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await axios.get(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        setProfileData(response.data);
      } catch (error) {
        console.error("Erro ao buscar perfil:", error);
        Alert.alert('Erro', 'Não foi possível carregar os dados do perfil.');
        // Define dados padrão em caso de erro para não quebrar a UI
        setProfileData({ nome_completo: 'Erro ao carregar', email: '-', cpf: '-' });
      } finally {
        setIsLoading(false);
      }
    };

    // Só busca se a tela estiver focada
    if (isFocused) {
      fetchProfile();
    }
  }, [authToken, isFocused]); // Re-executa se o token mudar ou a tela ganhar foco

  const handleLogout = () => {
    logout();
  };
  
  return (
    <View style={styles.container}>
      <FontAwesome name="user-circle-o" size={80} color="#666" style={styles.avatar} />
      <Text style={styles.title}>Meu Perfil</Text>

      {/* Exibe loading ou os dados do perfil */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#007BFF" style={{ marginTop: 20 }}/>
      ) : profileData ? (
        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={20} color="#555" style={styles.icon} />
            <Text style={styles.label}>Nome:</Text>
            <Text style={styles.value}>{profileData.nome_completo}</Text>
          </View>
          <View style={styles.infoRow}>
            <FontAwesome name="envelope" size={20} color="#555" style={styles.icon} />
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{profileData.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <FontAwesome name="id-card" size={20} color="#555" style={styles.icon} />
            <Text style={styles.label}>CPF:</Text>
            <Text style={styles.value}>{profileData.cpf}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.text}>Não foi possível carregar os dados.</Text>
      )}

      {/* Botão de Logout */}
      {authToken !== 'guest-token' && ( // Só mostra se não for convidado
        <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={isLoading}>
          <FontAwesome name="sign-out" size={20} color="white" />
          <Text style={styles.logoutButtonText}>Sair</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingTop: 60, // Mais espaço no topo
    paddingHorizontal: 20,
  },
  avatar: {
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30, // Mais espaço abaixo do título
    color: '#333',
  },
  infoContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    elevation: 3, // Sombra
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    marginBottom: 40, // Espaço antes do botão
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15, // Espaço entre as linhas
    borderBottomWidth: 1, // Linha separadora sutil
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  icon: {
    marginRight: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    width: 60, // Largura fixa para alinhar os valores
  },
  value: {
    fontSize: 16,
    color: '#555',
    flexShrink: 1, // Permite quebrar linha se for muito longo
  },
  text: { // Estilo para mensagens de erro ou estado vazio
    fontSize: 16,
    marginTop: 20,
    color: 'gray',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d9534f',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    elevation: 2,
    marginTop: 'auto', // Empurra para o final (se houver espaço)
    marginBottom: 40, // Margem inferior
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});