## 🏁 Sprint 1 – Autenticação e Visualização Inicial
**Objetivo da Sprint:** Garantir que os usuários possam acessar o sistema com segurança, logar com e-mail e visualizar suas propriedades em lista e no mapa.

### 🔹 User Stories e Critérios de Aceitação

#### 1. Login com E-mail
- **User Story:** Como usuário, quero logar com meu e-mail.
- **Critérios:**
  1. Ao inserir um e-mail válido, o usuário acessa o sistema.
  2. E-mail inválido retorna mensagem de erro clara.
  3. O login só deve ser concluído se o e-mail estiver cadastrado no banco de dados.

---

#### 2. Proteção de Sessão (JWT/OAuth)
- **User Story:** Como usuário, quero que minha sessão seja protegida.
- **Critérios:**
  1. Após login, o usuário recebe um token JWT válido.
  2. Se o token expirar, ao tentar acessar uma rota privada, deve ser redirecionado para login.
  3. Rotas públicas devem continuar acessíveis sem autenticação.

---

#### 3. Acesso Visitante
- **User Story:** Como visitante, quero acessar versão limitada do app.
- **Critérios:**
  1. Visitante acessa somente páginas públicas (home, informações institucionais).
  2. Tentativa de acessar páginas restritas exibe mensagem de login obrigatório.

---

#### 4. Listagem de Propriedades
- **User Story:** Como usuário, quero ver minhas propriedades no app.
- **Critérios:**
  1. Lista de propriedades vinculadas ao e-mail do usuário aparece após login.
  2. Caso não tenha propriedades, deve exibir mensagem “Nenhuma propriedade encontrada”.

---

#### 5. Visualizar Propriedades no Mapa
- **User Story:** Como usuário, quero visualizar minhas propriedades no mapa.
- **Critérios:**
  1. Cada propriedade aparece como marcador no mapa.
  2. Propriedades sem coordenadas não aparecem no mapa.
  3. O marcador abre um tooltip com nome e informações básicas.

---

#### 6. Diferenciar Propriedades com/sem Endereço
- **User Story:** Como usuário, quero diferenciar propriedades com e sem endereço.
- **Critérios:**
  1. Propriedades com endereço aparecem em cor/ícone diferente.
  2. Tooltip do marcador mostra “Endereço não definido” se não houver informação.

---
