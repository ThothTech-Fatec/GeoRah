<a href="../README.md">Voltar</a>

# 📄 Relatório Sprint - 02 (06/10/2025)

A Sprint 2 teve como foco o endereçamento das propriedades, validação no CAR, associação de coordenadas, integração dos dados fornecidos pelo cliente (área do projeto, área do imóvel e rotas) e geração de certificados oficiais em PDF, incluindo o envio automático por e-mail.

## 📜 Backlog Sprint 2

| Item | Status | 
| :----: | :----: | 
Validação no CAR | ⏳
Definir endereço via arrasto no mapa | ⏳
Definir endereço via GPS | ⏳
Salvar coordenadas da propriedade | ⏳  
Implementar dados do cliente (área do projeto, área do imóvel e rotas) | ⏳  
Gerar certificado em PDF | ⏳  
Enviar certificado por e-mail | ⏳  

## 🚀 Critérios de Aceitação

| Nº | Critério de Aceitação | Cenário de Teste |
|----|------------------------|------------------|
| 7.1 | Validação no CAR | Dado que realizo login com e-mail válido, quando consulto no CAR, então apenas minhas propriedades cadastradas devem aparecer. |
| 7.2 | Validação no CAR | Dado que o CAR não retorna dados, quando consulto, então devo ver a mensagem "Não foram encontradas propriedades no CAR". |
| 8.1 | Definir endereço via arrasto | Dado que movo o marcador no mapa, quando solto, então o endereço atualizado deve ser salvo no banco. |
| 8.2 | Definir endereço via arrasto | Dado que altero o marcador, quando salvo, então o tooltip do mapa deve refletir o novo endereço imediatamente. |
| 9.1 | Definir endereço via GPS | Dado que o GPS está habilitado, quando o sistema solicita permissão, então as coordenadas devem ser vinculadas à propriedade automaticamente. |
| 9.2 | Definir endereço via GPS | Dado que o GPS está desativado, quando tento usar o recurso, então recebo mensagem explicativa. |
| 10.1 | Salvar coordenadas | Dado que atualizo as coordenadas, quando salvo, então os dados devem persistir no banco de dados. |
| 10.2 | Salvar coordenadas | Dado que tenho coordenadas salvas, quando gero um certificado, então estas informações devem estar disponíveis. |
| 11.1 | Gerar certificado PDF | Dado que possuo uma propriedade com endereço válido, quando clico em gerar, então o certificado oficial deve ser criado. |
| 11.2 | Gerar certificado PDF | Dado que o certificado é gerado, então ele deve conter Nome do usuário, E-mail, Nome da propriedade e Endereço/Coordenadas. |
| 12.1 | Enviar certificado por e-mail | Dado que um certificado é gerado, quando o envio automático é realizado, então o usuário deve recebê-lo no e-mail cadastrado. |
| 12.2 | Enviar certificado por e-mail | Dado que ocorre falha no envio, quando o usuário é notificado, então ele deve poder solicitar reenvio. |
| 13.1 | Implementar dados do cliente | Dado que o cliente fornece informações de área e rotas, quando importadas, então devem ser exibidas corretamente na interface. |
| 13.2 | Implementar dados do cliente | Dado que os dados são atualizados, quando salvos, então devem ser persistidos e integrados às demais funcionalidades do sistema. |
| 13.3 | Implementar dados do cliente | Dado que as rotas são geradas, quando exibidas no mapa, então devem representar visualmente os caminhos definidos pelo cliente. |

## 💻 Tecnologias Utilizadas na Segunda Sprint

| Tecnologia | Descrição |
|------------|-----------|
| GitHub | Controle de versão |
| PostgreSQL | Banco de dados relacional |
| React Native | Desenvolvimento do app mobile |
| VSCode | IDE de desenvolvimento |
| TypeScript | Tipagem e estruturação de código |
| CSS3 / Styled Components | Estilização do app |
| Firebase | Notificações push e autenticação |
| ReportLab / PDFKit | Geração de certificados em PDF |

## 👓 Sprint Review
*(Vídeo ainda não disponível)*

## 👨‍💻 Trabalho desenvolvido
- Integração com o CAR para validação das propriedades.  
- Funcionalidade de atualização de endereços via GPS ou arrasto no mapa.  
- Persistência de coordenadas no banco de dados.  
- Implementação da integração dos dados fornecidos pelo cliente (área do projeto, área do imóvel e rotas).  
- Geração de certificados em PDF com dados da propriedade.  
- Envio automático do certificado por e-mail com opção de reenvio em caso de falha.  
