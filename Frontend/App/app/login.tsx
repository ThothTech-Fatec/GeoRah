// app/login.tsx
import React, { useState } from "react";
import axios from "axios"
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../context/AuthContext"; // 1. Importe o useAuth
import Constants from 'expo-constants'; // Importe o Constants
import styles from "./styles/login";

//    Substitua 'SEU_IP_AQUI' pelo endereço IPv4 que você encontrou
const API_URL = "http://10.0.2.2:3000";

export default function LoginScreen() {
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth(); // 2. Pegue a função de login do contexto

  const handleLogin = async () => {
    if (cpf === "" || senha === "") {
      Alert.alert("Erro", "Preencha todos os campos!");
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/login`, { cpf, senha });
      await login(response.data.token);
    } catch (error) {
      // eslint-disable-next-line import/no-named-as-default-member
      if (axios.isAxiosError(error) && error.response) {
        Alert.alert("Erro no Login", error.response.data.message || "Ocorreu um erro.");
      } else {
        console.error("Erro na requisição:", error);
        Alert.alert("Erro de Conexão", "Não foi possível conectar ao servidor.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Digite seu CPF"
        value={cpf}
        onChangeText={setCpf}
        keyboardType="numeric" // Mudei para teclado numérico para o CPF
      />

      <TextInput
        style={styles.input}
        placeholder="Digite sua senha"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoading}>
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      <Link href="/register" asChild>
        <TouchableOpacity style={{ marginTop: 20 }}>
          <Text style={{ color: '#007BFF', fontSize: 16 }}>
            Não tem uma conta? Cadastre-se agora
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}