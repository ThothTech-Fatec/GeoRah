// backend/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// Estendemos o tipo Request do Express para incluir nossa propriedade 'user'
interface AuthRequest extends Request {
  user?: { id: number };
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  console.log("Middleware 'protect' ativado. Cabeçalho de autorização:", req.headers.authorization);
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Pega o token do cabeçalho (ex: "Bearer eyJhbGci...")
      token = req.headers.authorization.split(' ')[1];

      // Verifica se o token é válido usando nosso segredo
      const decoded = jwt.verify(token, JWT_SECRET!) as { id: number };
      
      // Adiciona o ID do usuário ao objeto da requisição
      req.user = { id: decoded.id };
      
      next(); // Passa para a próxima função (a lógica da rota)
    } catch (error) {
      res.status(401).json({ message: 'Token inválido ou expirado.' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Acesso negado, nenhum token fornecido.' });
  }
};