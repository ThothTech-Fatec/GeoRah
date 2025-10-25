// app/login.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { Link } from "expo-router";

const API_URL = "http://10.0.2.2:3000"; // backend local (Android emulador)

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  // Função de login principal
  const handleLogin = async () => {
    if (email === "" || senha === "") {
      Alert.alert("Erro", "Preencha todos os campos!");
      return;
    }

    setIsLoading(true);

    try {
      // 🔹 Faz login no backend
      const response = await axios.post(`${API_URL}/login`, { email, senha });
      await login(response.data.token); // Salva o token de autenticação

      Alert.alert("Sucesso", "Login realizado com sucesso!");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        Alert.alert("Erro no Login", error.response.data.message || "Ocorreu um erro.");
      } else {
        Alert.alert("Erro de Conexão", "Não foi possível conectar ao servidor.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Login de convidado
  const handleGuestLogin = async () => {
    await login("guest-token");
  };

  return (
    <LinearGradient colors={["#00C6FB", "#005BEA"]} style={styles.container}>
      <Image
        style={styles.logo}
        source={require("../assets/images/login.png")}
      />

      <Text style={styles.appTitle}>GeoRah</Text>
      <Text style={styles.subtitle}>Mapeamento Rural Inteligente</Text>

      <TextInput
        style={styles.input}
        placeholder="Digite seu Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
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

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#4CAF50", marginTop: 10 }]}
        onPress={handleGuestLogin}
      >
        <Text style={styles.buttonText}>Entrar como Convidado</Text>
      </TouchableOpacity>

      <Link href="/register" asChild>
        <TouchableOpacity style={{ marginTop: 20 }}>
          <Text style={styles.linkText}>
            Não tem uma conta? Cadastre-se agora
          </Text>
        </TouchableOpacity>
      </Link>
    </LinearGradient>
  );
}

// Estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#f0f0f0",
    marginBottom: 40,
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    fontSize: 16,
  },
  button: {
    width: "100%",
    backgroundColor: "#007BFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  linkText: {
    color: "#fff",
    fontSize: 16,
  },
});
