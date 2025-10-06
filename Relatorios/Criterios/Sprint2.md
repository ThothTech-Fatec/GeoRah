## 🏁 Sprint 2 – Endereçamento e Certificação
**Objetivo da Sprint:** Permitir ao usuário associar coordenadas às propriedades, validar no CAR, atualizar endereços e gerar certificados oficiais em PDF.

### 🔹 User Stories e Critérios de Aceitação

#### 7. Validação no CAR
- **User Story:** Como usuário, quero validar no CAR para acessar minhas propriedades.
- **Critérios:**
  1. Ao logar com e-mail, o sistema consulta o CAR para validar a propriedade.
  2. Apenas propriedades vinculadas ao e-mail devem aparecer.
  3. Caso o CAR não retorne dados, o usuário recebe mensagem “Não foram encontradas propriedades no CAR”.

---

#### 8. Definir Endereço via Arrasto no Mapa
- **User Story:** Como usuário, quero definir endereço arrastando marcador.
- **Critérios:**
  1. O marcador pode ser movido manualmente.
  2. Ao soltar o marcador, o endereço atualizado é salvo no banco.
  3. Mudança reflete imediatamente no tooltip do marcador.

---

#### 9. Definir Endereço via GPS
- **User Story:** Como usuário, quero definir endereço usando GPS.
- **Critérios:**
  1. Sistema solicita permissão de acesso ao GPS.
  2. Coordenadas capturadas automaticamente vinculam à propriedade.
  3. Caso GPS esteja desabilitado, o sistema exibe mensagem explicativa.

---

#### 10. Salvar Coordenadas
- **User Story:** Como usuário, quero salvar coordenadas da propriedade.
- **Critérios:**
  1. Coordenadas são persistidas no banco de dados.
  2. Usuário consegue atualizar coordenadas já existentes.
  3. Dados devem estar disponíveis para o mapa e geração de certificados.

---

#### 11. Gerar Certificado PDF
- **User Story:** Como usuário, quero gerar certificado PDF.
- **Critérios:**
  1. Propriedade com endereço válido gera certificado oficial.
  2. Certificado exibe: Nome do usuário, E-mail, Nome da propriedade, Endereço/Coordenadas.
  3. Certificado é salvo no servidor e disponível para download.

---

#### 12. Enviar Certificado por E-mail
- **User Story:** Como usuário, quero receber certificado por e-mail.
- **Critérios:**
  1. Após geração, certificado é enviado automaticamente para o e-mail cadastrado.
  2. Usuário recebe mensagem de confirmação na tela.
  3. Caso o envio falhe, deve exibir mensagem clara e permitir reenvio.

---

#### 13. Implementar Dados do Cliente (Área do Projeto, Área do Imóvel e Rotas)
- **User Story:** Como usuário, quero visualizar e integrar os dados fornecidos pelo cliente (área do projeto, área do imóvel e rotas) para aprimorar a precisão das informações geográficas.
- **Prioridade:** Alta  
- **Tempo estimado:** 2 dias úteis  
- **Critérios:**
  1. Os dados recebidos devem ser armazenados no banco e exibidos no mapa principal.  
  2. As áreas devem ser delimitadas com contornos e preenchimentos visuais distintos.  
  3. As rotas devem ser desenhadas automaticamente conforme os pontos fornecidos.  
  4. O usuário deve conseguir visualizar e editar as informações sem perda de dados.  
  5. Em caso de erro de importação, o sistema deve exibir mensagem clara e registrar o log.  

---