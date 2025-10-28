// app/(tabs)/profile.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { useIsFocused } from '@react-navigation/native';

const API_URL = "http://10.0.2.2:3000";

// Interface do perfil
interface UserProfile {
  nome_completo: string;
  email: string;
  cpf: string;
}

// Função para mascarar CPF
const maskCPF = (cpf: string | null | undefined): string => {
  if (!cpf || cpf.length < 11 || cpf === '-' || cpf === 'Não informado') {
    return '***.***.***-**';
  }
  const numbers = cpf.replace(/\D/g, '');
  if (numbers.length !== 11) return 'CPF inválido';
  return `${numbers.substring(0,3)}.***.***-${numbers.substring(9,11)}`;
};

export default function ProfileScreen({ navigation }: any) {
  const { authToken, logout } = useAuth();
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isFocused = useIsFocused();

  // Busca dados do perfil
  useEffect(() => {
    const fetchProfile = async () => {
      if (!authToken || authToken === 'guest-token') {
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
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    };

    if (isFocused) fetchProfile();
  }, [authToken, isFocused]);

  const handleLogout = () => {
    logout(); // limpa token e estado
    if (navigation) navigation.replace('Login'); // redireciona para login
  };

  return (
    <View style={styles.container}>
      <FontAwesome name="user-circle-o" size={80} color="#666" style={styles.avatar} />
      <Text style={styles.title}>Meu Perfil</Text>

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
            <Text style={styles.value}>{maskCPF(profileData.cpf)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.text}>Não foi possível carregar os dados.</Text>
      )}

      {/* Botão de logout sempre visível */}
      <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={isLoading}>
        <FontAwesome name="sign-out" size={20} color="white" />
        <Text style={styles.logoutButtonText}>Sair</Text>
      </Pressable>
    </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 40,
    paddingHorizontal: 20,
  },
  avatar: { marginBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, color: '#333' },
  infoContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    marginBottom: 40,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  icon: { marginRight: 15 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', width: 60 },
  value: { fontSize: 16, color: '#555', flexShrink: 1 },
  text: { fontSize: 16, marginTop: 20, color: 'gray' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d9534f',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    elevation: 2,
    position: 'absolute',
    bottom: 40,
  },
  logoutButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
});
