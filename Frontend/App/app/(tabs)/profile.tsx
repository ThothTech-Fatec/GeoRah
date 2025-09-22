// app/(tabs)/profile.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext'; // Importe o useAuth

export default function ProfileScreen() {
  const { logout } = useAuth(); // Pegue a função logout

  const handleLogout = () => {
    logout(); // Chame a função do contexto
    // A navegação será tratada automaticamente
  };

  return (
    <View style={styles.container}>
      <FontAwesome name="user-circle-o" size={80} color="#333" />
      <Text style={styles.title}>Meu Perfil</Text>
      <Text style={styles.text}>Aqui ficarão as informações do usuário.</Text>

      {/* 4. Crie o botão que chama a função de logout */}
      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <FontAwesome name="sign-out" size={20} color="white" />
        <Text style={styles.logoutButtonText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 15,
  },
  text: {
    fontSize: 16,
    marginTop: 10,
    color: 'gray',
    marginBottom: 40,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d9534f', // Uma cor vermelha para indicar "sair"
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    elevation: 2,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});