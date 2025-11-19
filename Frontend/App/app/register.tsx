import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet, Platform, StatusBar,
  KeyboardAvoidingView, ScrollView, Modal
} from "react-native";
import { useRouter } from "expo-router";
import axios from "axios";

const API_URL = "http://10.0.2.2:3000";

export default function RegisterScreen() {
  const [nome_completo, setNomeCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cpf, setCpf] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const router = useRouter();

  const handleCpfChange = (text: string) => {
    const numbers = text.replace(/\D/g, "").slice(0, 11);
    let formatted = numbers;
    if (numbers.length > 3 && numbers.length <= 6) formatted = `${numbers.slice(0,3)}.${numbers.slice(3)}`;
    else if (numbers.length > 6 && numbers.length <= 9) formatted = `${numbers.slice(0,3)}.${numbers.slice(3,6)}.${numbers.slice(6)}`;
    else if (numbers.length > 9) formatted = `${numbers.slice(0,3)}.${numbers.slice(3,6)}.${numbers.slice(6,9)}-${numbers.slice(9,11)}`;
    setCpf(formatted);
  };

  const sendVerificationCode = async () => {
    if (!email) return Alert.alert("Erro", "Informe o e-mail antes de enviar o código");
    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/send-verification`, { email });
      setCodeSent(true);
      setModalVisible(true);
      Alert.alert("Código enviado", "Verifique seu e-mail para continuar.");
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Não foi possível enviar o código");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCodeAndRegister = async () => {
    if (!verificationCode) return Alert.alert("Erro", "Informe o código recebido");
    try {
      setIsLoading(true);

      // Verifica código
      await axios.post(`${API_URL}/verify-code`, { email, code: verificationCode });

      // Código ok, realiza cadastro
      const response = await axios.post(`${API_URL}/register`, {
        nome_completo, email, senha, cpf
      });

      if (response.status === 201 || response.status === 200) {
        Alert.alert("Sucesso", "Cadastro realizado com sucesso! Faça login agora.");
        router.back();
      }
    } catch (error: any) {
      console.error(error);
      const message = error.response?.data?.message || "Erro durante o cadastro";
      Alert.alert("Erro", message);
    } finally {
      setIsLoading(false);
      setModalVisible(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Cadastro</Text>

        <TextInput style={styles.input} placeholder="Nome Completo" value={nome_completo} onChangeText={setNomeCompleto} autoCapitalize="words"/>
        <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
        <TextInput style={styles.input} placeholder="CPF (000.000.000-00)" value={cpf} onChangeText={handleCpfChange} keyboardType="numeric"/>
        <TextInput style={styles.input} placeholder="Senha" value={senha} onChangeText={setSenha} secureTextEntry/>

        <TouchableOpacity style={[styles.button, isLoading && {opacity:0.7}]} onPress={sendVerificationCode} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Enviar Código</Text>}
        </TouchableOpacity>

        {/* Modal de verificação */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Digite o código enviado para {email}</Text>
              <TextInput
                style={styles.input}
                placeholder="Código"
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.button} onPress={verifyCodeAndRegister}>
                {isLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Confirmar Cadastro</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, {backgroundColor:'#6c757d', marginTop:10}]} onPress={() => setModalVisible(false)}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Estilos ---
const STATUS_BAR_HEIGHT = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f8f8", paddingTop: STATUS_BAR_HEIGHT + 10 },
  scrollContainer: { flexGrow:1, justifyContent:"center", alignItems:"center", padding:30 },
  title: { fontSize:32, fontWeight:"bold", marginBottom:30, textAlign:"center", color:"#333" },
  input: { width:"100%", height:50, borderColor:"#ccc", borderWidth:1, borderRadius:8, paddingHorizontal:15, marginBottom:15, backgroundColor:"white", fontSize:16 },
  button: { width:"100%", padding:15, borderRadius:8, alignItems:"center", backgroundColor:"#007BFF", marginTop:10, elevation:3 },
  buttonText: { color:"white", fontWeight:"bold", fontSize:18 },
  modalContainer: { flex:1, justifyContent:"center", alignItems:"center", backgroundColor:"rgba(0,0,0,0.5)" },
  modalContent: { width:"90%", backgroundColor:"#fff", borderRadius:10, padding:20 },
  modalTitle: { fontSize:18, fontWeight:"bold", marginBottom:15 },
});
