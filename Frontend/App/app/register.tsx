// app/register.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import styles from "./styles/login"; // Reutilizaremos os mesmos estilos
import axios from 'axios';
import Constants from 'expo-constants'; // Importe o Constants


const API_URL = "http://10.0.2.2:3000";


export default function RegisterScreen() {
  const [nome_completo, setNomeCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

   const handleRegister = async () => {
    if (nome_completo === "" || email === "" || senha === "") {
      Alert.alert("Erro", "Preencha todos os campos!");
      return;
    }
    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/register`, { nome_completo, email, senha });
      Alert.alert("Sucesso", "Cadastro realizado! Agora você pode fazer o login.");
      router.back();
    } catch (error) {
      // eslint-disable-next-line import/no-named-as-default-member
      if (axios.isAxiosError(error) && error.response) {
        Alert.alert("Erro no Cadastro", error.response.data.message || "Ocorreu um erro.");
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
      <Text style={styles.title}>Cadastro</Text>

      <TextInput
        style={styles.input}
        placeholder="Nome Completo"
        value={nome_completo}
        onChangeText={setNomeCompleto}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address" 
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cadastrar</Text>}
      </TouchableOpacity>
    </View>
  );
}