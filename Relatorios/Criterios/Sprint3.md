## 🏁 Sprint 3 – Rotas e Alertas em Tempo Real
**Objetivo da Sprint:** Permitir ao usuário planejar rotas otimizadas entre propriedades e implementar sistema de alertas colaborativos e meteorológicos.

### 🔹 User Stories e Critérios de Aceitação

#### 14. Planejar Rotas entre Propriedades
- **User Story:** Como usuário, quero planejar rotas entre duas propriedades.
- **Critérios:**
  1. Usuário seleciona origem e destino no mapa.
  2. Rota traçada aparece visualmente no mapa.
  3. Sistema considera estradas rurais, quando disponíveis.

---

#### 15. Informações de Rotas (Tempo, Distância, Alternativas)
- **User Story:** Como usuário, quero ver tempo, distância e rotas alternativas.
- **Critérios:**
  1. Sistema exibe tempo estimado de viagem.
  2. Distância total é apresentada em km.
  3. Rotas alternativas são sugeridas se disponíveis.

---

#### 16. Alertas Colaborativos
- **User Story:** Como usuário, quero criar alertas colaborativos sobre condições da estrada.
- **Critérios:**
  1. Usuário pode cadastrar alerta com descrição e localização.
  2. Alertas ficam visíveis no mapa em tempo real.
  3. Outros usuários conseguem visualizar e interagir com os alertas.

---

#### 17. Alertas Meteorológicos
- **User Story:** Como usuário, quero receber alertas meteorológicos integrados de uma API de clima.
- **Critérios:**
  1. Sistema consome API externa de clima em tempo real.
  2. Alertas meteorológicos aparecem no mapa e em notificações.
  3. Usuário pode ativar/desativar alertas meteorológicos.

---

#### 18. Expiração de Alertas
- **User Story:** Como usuário, quero que os alertas tenham validade/expiração automática.
- **Critérios:**
  1. Cada alerta possui tempo de expiração definido.
  2. Após expirar, o alerta desaparece automaticamente do mapa.
  3. Usuário é notificado quando seus alertas expirarem.

---

