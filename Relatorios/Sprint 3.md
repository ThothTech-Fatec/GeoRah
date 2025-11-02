<a href="../README.md">Voltar</a>

# 📄 Relatório Sprint - 03 (20/10/2025)

A Sprint 3 tem como foco as funcionalidades de rotas e navegação entre propriedades, criação de alertas colaborativos, integração com API de clima para alertas meteorológicos e definição de um ponto de entrada da propriedade, que passa a ser utilizado como referência principal para o cálculo da rota.

## 📜 Backlog Sprint 3

| Item | Status |
| :----: | :----: |
Planejar rotas entre propriedades | ⏳
Ver tempo, distância e rotas alternativas | ⏳
Criar alertas colaborativos sobre condições da estrada | ⏳
Receber alertas meteorológicos integrados de uma API de clima | ⏳
Definir ponto de entrada da propriedade (novo) | ⏳
Expiração automática dos alertas | ⏳

## 🚀 Critérios de Aceitação

| Nº | Critério de Aceitação | Cenário de Teste |
|----|------------------------|------------------|
| 14.1 | Planejar rotas entre propriedades | Dado que possuo duas propriedades cadastradas, quando seleciono ambas no mapa, então devo visualizar um trajeto entre elas. |
| 14.2 | Planejar rotas | Dado que não existem duas propriedades selecionadas, quando tento gerar rota, então devo ser instruído a selecionar outra propriedade. |
| 15.1 | Tempo / distância / rotas alternativas | Dado que uma rota é gerada, quando exibida, então deve mostrar tempo estimado e distância aproximada. |
| 15.2 | Tempo / distância / rotas alternativas | Dado que existam rotas alternativas, quando selecionadas, então o mapa deve atualizar o trajeto. |
| 16.1 | Alertas colaborativos | Dado que crio um alerta, quando salvo, então ele deve ficar visível no mapa imediatamente. |
| 16.2 | Alertas colaborativos | Dado que existe um alerta no mapa, quando um outro usuário acessa o mapa, então o alerta deve aparecer para ele também. |
| 17.1 | Alertas meteorológicos | Dado que a API de clima retorna alerta, quando exibido, então o usuário deve visualizar o alerta em tempo real. |
| 17.2 | Alertas meteorológicos | Dado que não há alertas, quando acesso o mapa, então nenhuma notificação meteorológica deve aparecer. |
| 19.1 | Ponto de entrada da propriedade | Dado que defino um ponto de entrada manualmente, quando gero uma rota para uma propriedade, então esse ponto deve ser a referência inicial do traçado. |
| 18.1 | Expiração automática de alertas | Dado que o alerta está expirado, quando a data de validade é alcançada, então o alerta deve desaparecer automaticamente do mapa. |

## 💻 Tecnologias Utilizadas na Terceira Sprint

| Tecnologia | Descrição |
|------------|-----------|
| React Native | Desenvolvimento do app mobile |
| Google Directions API / Maps API | Rotas e trajetos |
| Firebase | Persistência de alertas |
| TypeScript | Tipagem e estruturação de código |
| CSS3 / Styled Components | Estilização do app |
| OpenWeather API | Integração de clima |
| PostgreSQL | Banco de dados relacional |

## 👓 Sprint Review
*(Vídeo ainda não disponível)*

## 👨‍💻 Trabalho desenvolvido
- Geração de rotas entre duas propriedades no mapa.
- Exibição de tempo estimado e rotas alternativas.
- Definição do ponto de entrada da propriedade para cálculo de rotas.
- Criação de alertas colaborativos em mapa.
- Expiração automática dos alertas após data limite.
- Integração com OpenWeather API para alertas meteorológicos em tempo real.
