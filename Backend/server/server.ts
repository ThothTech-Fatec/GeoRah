// backend/server.ts
import 'dotenv/config'; // MOVIDO PARA O TOPO
import express, { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import { protect } from '../middleware/authMiddleware'; // Corrigido o caminho
import jwt from 'jsonwebtoken';


const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("A chave JWT_SECRET não está definida no arquivo .env");
}

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD, 
  database: 'georah_db'
});

db.connect(err => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:', err);
    return;
  }
  console.log('Conectado ao banco de dados MySQL com sucesso!');
});

app.post('/login', (req: Request, res: Response) => {
  const { email, senha } = req.body;
  console.log('Recebida requisição na rota /login com o corpo:', req.body);
  if (!email || !senha) {
    return res.status(400).json({ message: 'email e senha são obrigatórios.' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], (err, results: any) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const user = results[0];

    bcrypt.compare(senha, user.senha, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ message: 'Senha incorreta.' });
      }
      
      // 4. Se a senha estiver correta, GERE O TOKEN
      const payload = { id: user.id, email: user.email };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }); // Token expira em 1 dia

      // 5. Envie o token de volta para o frontend
      res.status(200).json({ 
        message: 'Login realizado com sucesso!', 
        token: token 
      });
    });
  });
});

app.post('/register', (req: Request, res: Response) => {
  const { nome_completo, email, senha } = req.body;

  if (!nome_completo || !email || !senha) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  // Criptografa a senha antes de salvar
  bcrypt.hash(senha, 10, (err, hash) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao criptografar a senha.' });
    }

    const query = 'INSERT INTO users (nome_completo, email, senha) VALUES (?, ?, ?)';
    db.query(query, [nome_completo, email, hash], (err, results) => {
      if (err) {
        // Trata o erro de CPF duplicado
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'Este email já está cadastrado.' });
        }
        return res.status(500).json({ message: 'Erro ao registrar o usuário.', error: err });
      }
      res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    });
  });
});


app.get('/properties', protect, (req: any, res: Response) => {
  const userId = req.user.id; // Pegamos o ID do usuário do token

  const query = 'SELECT id, car_code, nome_propriedade, latitude, longitude, plus_code FROM properties WHERE user_id = ?';
  db.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar propriedades.' });
    }

    // 3. Verifique se 'results' é um array antes de usar .map()
    if (Array.isArray(results)) {
      const formattedResults = (results as RowDataPacket[]).map(property => ({
        ...property,
        latitude: parseFloat(property.latitude),
        longitude: parseFloat(property.longitude),
      }));
      return res.status(200).json(formattedResults);
    }

    // Caso não seja um array (pouco provável para um SELECT, mas seguro)
    return res.status(200).json([]);
  });
});

app.post('/properties', protect, (req: any, res: Response) => {
  // 1. Recebe os novos dados do corpo da requisição
  const { 
    car_code, 
    nome_propriedade, 
    latitude, 
    longitude, 
    plus_code 
  } = req.body;
  
  const userId = req.user.id; // Pegamos o ID do usuário do token verificado

  if (!car_code || !nome_propriedade || !latitude || !longitude || !plus_code) {
    return res.status(400).json({ message: 'Todos os campos (CAR, Nome, Localização) são obrigatórios.' });
  }

  // 2. Query SQL atualizada para incluir os novos campos
  const query = `
    INSERT INTO properties 
    (user_id, car_code, nome_propriedade, latitude, longitude, plus_code, possui_endereco) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  // 3. O valor 'TRUE' indica que a propriedade agora tem uma localização definida
  const values = [userId, car_code, nome_propriedade, latitude, longitude, plus_code, true];

  db.query(query, values, (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Este código CAR já está cadastrado.' });
      }
      console.error("Erro no banco:", err); // Log para depuração
      return res.status(500).json({ message: 'Erro ao adicionar propriedade.' });
    }
    res.status(201).json({ message: 'Propriedade adicionada com sucesso!' });
  });
});

app.delete('/properties/:id', protect, (req: any, res: Response) => {
  const propertyId = req.params.id; // Pega o ID da URL
  const userId = req.user.id; // Pega o ID do usuário logado (do token)

  // Query para deletar a propriedade, garantindo que ela pertence ao usuário logado
  const query = 'DELETE FROM properties WHERE id = ? AND user_id = ?';
  
  db.query(query, [propertyId, userId], (err, results: any) => {
    if (err) {
      console.error("Erro no banco ao deletar:", err);
      return res.status(500).json({ message: 'Erro ao excluir a propriedade.' });
    }

    // A propriedade 'affectedRows' nos diz se alguma linha foi de fato deletada
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Propriedade não encontrada ou não pertence a você.' });
    }

    res.status(200).json({ message: 'Propriedade excluída com sucesso.' });
  });
});

app.get('/properties/public', (req: Request, res: Response) => {
  // 1. Query SQL que junta as tabelas 'properties' e 'users'
  const query = `
    SELECT 
      p.id, 
      p.nome_propriedade, 
      p.car_code, 
      p.latitude, 
      p.longitude, 
      p.plus_code,
      u.nome_completo AS owner_name 
    FROM 
      properties p
    JOIN 
      users u ON p.user_id = u.id
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error("Erro ao buscar propriedades públicas:", err);
      return res.status(500).json({ message: 'Erro ao buscar propriedades.' });
    }

    // 2. Mesma formatação de coordenadas que já fazemos
    if (Array.isArray(results)) {
      const formattedResults = (results as RowDataPacket[]).map(property => ({
        ...property,
        latitude: parseFloat(property.latitude),
        longitude: parseFloat(property.longitude),
      }));
      return res.status(200).json(formattedResults);
    }
    
    return res.status(200).json([]);
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});