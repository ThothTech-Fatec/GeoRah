<img width="1920" height="720" alt="Image" src="https://github.com/user-attachments/assets/23ae3eab-6253-404e-83c5-ce018ce2168b" />

## 🔍 Visão Geral
Desenvolvido por nós, alunos da Fatec SJC Jessen Vidal, o GeoRah é um app para gestão de propriedades rurais. Com APIs do Google Maps e Plus Code, ele permite definir endereços, gerar rotas otimizadas e receber alertas em tempo real. Uma ferramenta inovadora para simplificar o trabalho no campo.

## 🎯 Solução Proposta
A aplicação oferecerá:

- Autenticação segura de usuários.
- Cadastro e gerenciamento de informações no banco de dados.
- Visualização de dados em tempo real.
- Integração com APIs externas.
- Notificações push para alertas e interações rápidas.

## 🧩 MVP
<img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/92705c69-cde4-4625-89bb-add108756f69" />

---

## 📃 Backlog do Produto


| Rank | Prioridade | User Story | Estimativa | Sprint | Requisito do Parceiro | Critério de Aceitação | Status |
|------|------------|------------|------------|--------|------------------------|-----------------------|--------|
| 1 | Alta | Como usuário, quero logar com meu e-mail. | 5 pts | 1 | Autenticação com e-mail | Usuário consegue logar com sucesso. | ✅ |
| 2 | Alta | Como usuário, quero que minha sessão seja protegida com autenticação JWT/OAuth. | 3 pts | 1 | Segurança de login | Apenas usuários autenticados conseguem acessar. | ✅ |
| 3 | Média | Como visitante, quero acessar uma versão limitada do app sem login. | 2 pts | 1 | Acesso restrito | Visitantes acessam somente informações públicas. | ✅ |
| 4 | Alta | Como usuário, quero ver a listagem das minhas propriedades no app. | 5 pts | 1 | Exibição de propriedades | Propriedades vinculadas ao usuário aparecem listadas. | ✅ |
| 5 | Alta | Como usuário, quero visualizar minhas propriedades no mapa interativo. | 8 pts | 1 | Integração com mapa | Propriedades aparecem como marcadores no mapa. | ✅ |
| 6 | Média | Como usuário, quero diferenciar propriedades com e sem endereço no mapa. | 3 pts | 1 | Diferenciação visual | Marcadores mostram claramente se têm endereço ou não. | ✅ |
| 7 | Alta | Como usuário, quero validar no CAR para acessar minhas propriedades. | 5 pts | 2 | Autenticação com CAR | Usuário consegue acessar suas propriedades. | ⏳ |
| 8 | Alta | Como usuário, quero definir o endereço da propriedade arrastando o marcador no mapa. | 5 pts | 2 | GPS/arrasto no mapa | Endereço atualizado é salvo corretamente. | ⏳ |
| 9 | Alta | Como usuário, quero definir o endereço usando o GPS do dispositivo. | 5 pts | 2 | Integração com GPS | Coordenadas salvas automaticamente. | ⏳ |
| 10 | Alta | Como usuário, quero salvar coordenadas associadas a minha propriedade. | 3 pts | 2 | Banco de dados integrado | Dados persistem no sistema. | ⏳ |
| 11 | Alta | Como usuário, quero gerar um certificado em PDF com meu endereço atualizado. | 5 pts | 2 | Certificado oficial | PDF é gerado corretamente. | ⏳ |
| 12 | Alta | Como usuário, quero receber o certificado por e-mail automaticamente. | 3 pts | 2 | Integração com e-mail | Usuário recebe certificado no e-mail cadastrado. | ⏳ |
| 13 | Alta | Como usuário, quero planejar rotas entre duas propriedades. | 8 pts | 3 | Rotas integradas ao mapa | Usuário visualiza caminho entre propriedades. | ⏳ |
| 14 | Alta | Como usuário, quero ver tempo, distância e rotas alternativas. | 5 pts | 3 | API de rotas | Informações de tempo/distância aparecem corretamente. | ⏳ |
| 15 | Média | Como usuário, quero criar alertas colaborativos sobre condições da estrada. | 5 pts | 3 | Alertas colaborativos | Alertas ficam visíveis no mapa. | ⏳ |
| 16 | Média | Como usuário, quero receber alertas meteorológicos integrados de uma API de clima. | 5 pts | 3 | Integração com API de clima | Alertas aparecem em tempo real. | ⏳ |
| 17 | Baixa | Como usuário, quero que os alertas tenham validade/expiração automática. | 3 pts | 3 | Gerenciamento de alertas | Alertas vencidos desaparecem do mapa. | ⏳ |

---

# ✅ Critérios de Aceitação Detalhados

 ### <a href="./Relatorios/Criterios/Sprint1.md">1️⃣ Critérios referentes à 1ª Sprint </a> 
 ### <a href="./Relatorios/Criterios/Sprint2.md">2️⃣ Critérios referentes à 2ª Sprint </a> 
 ### <a href="./Relatorios/Criterios/Sprint3.md">3️⃣ Critérios referentes à 3ª Sprint </a>  

---

## 📈 Requisitos Funcionais
- Autenticação e cadastro de usuários.
- Consumo de APIs externas e internas.
- Gerenciamento de dados com banco relacional.
- Geração de relatórios em PDF.
- Notificações push integradas.

## 📊 Requisitos Não Funcionais
- **Segurança**: JWT/OAuth para autenticação.  
- **Usabilidade**: Interface amigável e responsiva.  
- **Desempenho**: Respostas rápidas em consultas e requisições.  
- **Escalabilidade**: Suporte a múltiplos usuários simultâneos.  
- **Portabilidade**: Compatível com dispositivos móveis.

---

## 🧷 Sprints
 ### <a href="./Relatorios/Sprint 1.md">1️⃣SPRINT 1 - Entrega: 28/09/2025) </a> 
 ### <a href="./Relatorios/Sprint 2.md">2️⃣SPRINT 2 - Entrega: 06/10/2025) </a> 
 ### <a href="./Relatorios/Sprint 3.md">3️⃣SPRINT 3 - Entrega: 03/11/2025) </a>  

---

## 🛠️ Tecnologias
- **Frontend (Mobile)**
  - React Native (Expo)  
  - TypeScript  
  - React Navigation  
  - Redux Toolkit / Context API  
  - Axios / React Query  
  - Styled Components / Nativewind  

- **Backend**
  - Python (FastAPI ou Flask)  
  - SQLAlchemy  
  - PostgreSQL / SQLite  
  - Docker  

- **Serviços**
  - Firebase (notificações push e autenticação)  
  - Supabase (alternativa a Firebase)  
  - ReportLab / PDFKit (geração de PDFs)  
  - GitHub / Jira (controle de versão e gestão ágil)  

- **Testes**
  - Jest (frontend)  
  - Pytest (backend)  

---

## 🎓 Time
| Nome | Função | GitHub | LinkedIn |
|------|--------|--------|----------|
|Lucas Kendi | Scrum Master|[<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white">](https://github.com/Subinoonibus) | [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white">](https://www.linkedin.com/in/vin%C3%ADcius-henrique-souza-4085b1226/)
|  Gustavo Henrique   | Product Owner | [<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white">](https://github.com/HenryBRG)| [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white">](https://www.linkedin.com/in/gustavo-henrique-braga-b92544252/)|
|  Márcio Gabriel  | Dev Team |[<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white">](https://github.com/Porisso90) | [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white">](https://www.linkedin.com/in/m%C3%A1rcio-gabriel-426b0527b/)
| Flávio Gonçalves| Dev Team | [<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white">](https://github.com/flaviogcunha)|[<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white">](https://www.linkedin.com/in/flavio-gon%C3%A7alves-21aa91261/) |
|Gustavo Badim | Dev Team |[<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white">](https://github.com/gubasssss) |[<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white">](https://www.linkedin.com/in/gustavo-badim-8538b7285)
| Vinicius Henrique| Dev Team | [<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white">](https://github.com/Subinoonibus) | [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white">](https://www.linkedin.com/in/vin%C3%ADcius-henrique-souza-4085b1226/) |
