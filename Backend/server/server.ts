// backend/server.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { RowDataPacket } from 'mysql2';
import { routeEngine } from '../services/routeEngine';
import RoadModel from '../models/Road';
import { getWeatherAlert } from '../services/weatherService';
import mysql from 'mysql2';
import { alertStore, AlertType } from '../services/alertStore';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import { protect } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import util from 'util';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { getDistance, getNearestPointOnSegment } from '../utils/geo';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("A chave JWT_SECRET não está definida no arquivo .env");

const MONGO_URI = "mongodb://localhost:27017/georah";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('🍃 Conectado ao MongoDB com sucesso!');

    await routeEngine.initialize();
  })
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD,
  database: 'georah_db'
});

db.connect(err => {
  if (err) return console.error('Erro ao conectar ao MySQL:', err);
  console.log('Conectado ao banco de dados MySQL com sucesso!');
});

function formatCPF(cpfRaw?: string | null): string {
  if (!cpfRaw) return '---';
  const digits = String(cpfRaw).replace(/\D/g, '').padStart(0, '0').slice(0, 11);
  if (digits.length !== 11) return cpfRaw; // retorna original se não tiver 11 dígitos
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Gera um certificado em PDF e faz stream para a resposta HTTP (Express).
 * Agora recebe explicitamente `cpfProprietario`.
 */
export async function gerarCertificadoPDF(
  res: Response,
  nome: string,
  email: string,
  carCode: string,
  nomePropriedade: string,
  latitude: number,
  longitude: number,
  plusCode: string | null,
  cpfProprietario?: string | null
): Promise<void> {
  try {
    const safeName = String(nome || 'proprietario').replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
    const safeCar = String(carCode || 'CAR').replace(/[^\w\-]/g, '');
    const fileName = `certificado_${safeName}_${safeCar}.pdf`;

    // Headers de resposta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.pipe(res);

    // Dimensões
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Fundo com bordas suaves e verde-claro
    doc.save();
    doc.lineWidth(2);
    doc.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 8).stroke('#6BCB77');
    doc.restore();

    // Cabeçalho com bloco verde claro
    const headerHeight = 120;
    doc.save();
    doc.rect(20, 20, pageWidth - 40, headerHeight).fill('#A8E6A1');
    doc.restore();

    // Ícone de globo simples (desenhado)
    doc.save();
    // centraliza levemente no topo
    const globeX = pageWidth / 2 - 25;
    doc.translate(globeX, 30);
    doc.scale(0.4);
    doc.circle(50, 50, 45).stroke('#388E3C');
    doc.moveTo(5, 50).lineTo(95, 50).stroke('#388E3C');
    doc.moveTo(50, 5).lineTo(50, 95).stroke('#388E3C');
    doc.moveTo(20, 50).bezierCurveTo(30, 20, 70, 20, 80, 50).bezierCurveTo(70, 80, 30, 80, 20, 50).stroke('#388E3C');
    doc.restore();

    // Título
    doc.fillColor('#1B5E20');
    doc.font('Helvetica-Bold').fontSize(20);
    doc.text('CERTIFICADO DE CADASTRO DE', 100, 70, { width: pageWidth - 200, align: 'center' });
    doc.text('PROPRIEDADE', 100, 90, { width: pageWidth - 200, align: 'center' });

    doc.font('Helvetica').fontSize(11);
    doc.text('GeoRah — Cadastro e Monitoramento Rural Inteligente', 100, 110, { width: pageWidth - 200, align: 'center' });

    // Corpo principal
    let y = 160;
    doc.fillColor('black');
    doc.font('Helvetica').fontSize(13);
    doc.text('Certificamos que o(a) proprietário(a):', 60, y);
    y += 22;

    doc.font('Helvetica-Bold').fontSize(18);
    doc.text(nome || '---', 60, y, { underline: true });
    y += 40;

    // Layout de informações
    const leftX = 60;
    const leftValueX = 220;
    const rightX = pageWidth / 2 + 10;
    const rightValueX = rightX + 90;
    const lineHeight = 22;

    doc.font('Helvetica').fontSize(12);

    // CAR (linha completa)
    doc.text('Código CAR:', leftX, y);
    doc.font('Helvetica-Bold').text(carCode || '---', leftValueX, y, { width: pageWidth - leftValueX - 60 });
    y += lineHeight;

    // Nome propriedade (linha completa)
    doc.font('Helvetica').fontSize(12).text('Nome da Propriedade:', leftX, y);
    doc.font('Helvetica-Bold').text(nomePropriedade || '---', leftValueX, y, { width: pageWidth - leftValueX - 60 });
    y += (lineHeight + 10);

    // Colunas: Latitude / Longitude / CPF / Plus Code
    let yCol = y;

    doc.font('Helvetica').fontSize(12);
    doc.text('Latitude:', leftX, yCol);
    doc.font('Helvetica-Bold').text(String(latitude ?? 'N/A'), leftValueX, yCol);

    doc.font('Helvetica').text('Longitude:', rightX, yCol);
    doc.font('Helvetica-Bold').text(String(longitude ?? 'N/A'), rightValueX, yCol);
    yCol += lineHeight;

    doc.font('Helvetica').text('CPF do Proprietário:', leftX, yCol);
    const cpfFormatado = formatCPF(cpfProprietario ?? undefined);
    doc.font('Helvetica-Bold').text(cpfFormatado, leftValueX, yCol);

    doc.font('Helvetica').text('Plus Code:', rightX, yCol);
    doc.font('Helvetica-Bold').text(plusCode ?? 'N/A', rightValueX, yCol);

    y = yCol + lineHeight;

    // Linha divisória
    y += 10;
    doc.moveTo(60, y).lineTo(pageWidth - 60, y).dash(2, { space: 2 }).stroke('#B0BEC5').undash();
    y += 20;

    // Declaração
    const declaration = `As informações acima correspondem ao registro realizado na plataforma GeoRah, atestando a validade dos dados fornecidos pelo proprietário e seu vínculo com a área rural identificada.`;
    doc.font('Helvetica').fontSize(11).text(declaration, 60, y, { width: pageWidth - 120, align: 'justify' });

    // Data
    const issueDate = new Date().toLocaleDateString('pt-BR');
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#2E7D32');
    doc.text(`Emitido em: ${issueDate}`, 60, pageHeight - 120);

    // Rodapé
    doc.font('Helvetica').fontSize(8).fillColor('#4CAF50').text('Certificado gerado automaticamente pelo sistema GeoRah © 2025', 60, pageHeight - 70, {
      align: 'center',
      width: pageWidth - 120
    });

    doc.end();
  } catch (err) {
    // se der erro durante criação, tenta responder com 500 (se ainda possível)
    try { res.status(500).json({ message: 'Erro ao gerar PDF' }); } catch (_) { /* noop */ }
    console.error('Erro gerarCertificadoPDF:', err);
  }
}
// ====================== ROTAS ======================

// LOGIN
app.post('/login', (req: Request, res: Response) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ message: 'Email e senha são obrigatórios.' });

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results: any) => {
    if (err || !results || results.length === 0) return res.status(404).json({ message: 'Usuário não encontrado.' });

    const user = results[0];
    bcrypt.compare(senha, user.senha, (err, isMatch) => {
      if (err || !isMatch) return res.status(401).json({ message: 'Senha incorreta.' });

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
      return res.status(200).json({ message: 'Login realizado com sucesso!', token });
    });
  });
});

// --- PROMISIFY PARA USAR AWAIT ---
const dbQuery = (sql: string, values?: any[]): Promise<any> =>
  new Promise((resolve, reject) => {
    db.query(sql, values, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

const hashAsync = util.promisify(bcrypt.hash);

// REGISTRO DE USUÁRIO (COM LÓGICA DE ASSOCIAÇÃO/REIVINDICAÇÃO DE CPF)
app.post('/register', async (req: Request, res: Response) => {
  // 1. Receber TODOS os campos do frontend
  const { nome_completo, email, senha, cpf } = req.body;

  // Validação
  if (!nome_completo || !email || !senha || !cpf || cpf.length !== 14) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios e o CPF deve ter 11 dígitos.' });
  }

  try {
    // 2. Verificar APENAS o CPF
    // CORREÇÃO: Usa 'await dbQuery' (a versão promise) em vez de db.execute
    const existingUsers = await dbQuery('SELECT * FROM users WHERE cpf = ?', [cpf]) as any[];

    // CORREÇÃO: Usa 'await hashAsync'
    const hash = await hashAsync(senha, 10);

    if (existingUsers && existingUsers.length > 0) {
      // CPF Encontrado
      const user = existingUsers[0];
      const placeholderEmail = `${cpf}@georah.com`;

      if (user.email === placeholderEmail) {
        // Cenário 1: É um placeholder. Reivindica a conta.
        try {
          // CORREÇÃO: Usa 'await dbQuery'
          await dbQuery(
            'UPDATE users SET nome_completo = ?, email = ?, senha = ? WHERE cpf = ?',
            [nome_completo, email, hash, cpf]
          );
          return res.status(200).json({ message: 'Conta existente atualizada com sucesso!' });
        } catch (error: any) {
          if (error.code === 'ER_DUP_ENTRY' && error.message.includes('email')) {
            return res.status(409).json({ message: 'Este CPF é seu, mas o email que você digitou já está sendo usado por outra conta.' });
          }
          throw error; // Lança outros erros
        }

      } else {
        // Cenário 2: É um usuário real. CPF já cadastrado.
        return res.status(409).json({ message: 'Este CPF já está cadastrado em outra conta.' });
      }
    }

    // Cenário 3: Usuário 100% novo (CPF não encontrado)
    // CORREÇÃO: Usa 'await dbQuery'
    const insertResult = await dbQuery(
      'INSERT INTO users (nome_completo, email, cpf, senha) VALUES (?, ?, ?, ?)',
      [nome_completo, email, cpf, hash]
    ) as any; // 'any' para insertId

    const newUserId = insertResult.insertId;

    // --- LÓGICA DE ASSOCIAÇÃO ---
    // CORREÇÃO: Usa 'await dbQuery'
    const updatePropsResult = await dbQuery(
      `UPDATE properties SET user_id = ? 
       WHERE cpf_proprietario = ? AND (user_id IS NULL OR user_id = 0)`,
      [newUserId, cpf]
    ) as any; // 'any' para affectedRows

    if (updatePropsResult.affectedRows > 0) {
      console.log(`Usuário ${newUserId} associado a ${updatePropsResult.affectedRows} propriedades.`);
      return res.status(201).json({ message: 'Usuário cadastrado e propriedades existentes associadas!' });
    } else {
      return res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    }

  } catch (error: any) {
    // Lida com erros de 'INSERT' (email duplicado)
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('email')) {
        return res.status(409).json({ message: 'Este email já está cadastrado.' });
      }
    }
    console.error('Erro no /register:', error);
    return res.status(500).json({ message: 'Erro interno ao registrar usuário.' });
  }
});

// REGISTRO DE PROPRIEDADE (envia certificado apenas aqui)
app.post('/properties', protect, (req: any, res: Response) => {
  const { car_code, nome_propriedade, latitude, longitude, plus_code, boundary, municipio, uf } = req.body;
  const userId = req.user.id;

  if (!car_code || !nome_propriedade || !latitude || !longitude || !plus_code)
    return res.status(400).json({ message: 'Campos obrigatórios ausentes.' });

  const query = `
    INSERT INTO properties 
    (user_id, car_code, nome_propriedade, latitude, longitude, plus_code, boundary, possui_endereco, municipio, uf)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    userId, car_code, nome_propriedade, latitude, longitude, plus_code,
    boundary ? JSON.stringify(boundary) : null, true, municipio || null, uf || null
  ];

  db.query(query, values, (err, results: any) => {
    if (err) {
      if ((err as any).code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Este código CAR já existe.' });
      return res.status(500).json({ message: 'Erro ao adicionar propriedade.' });
    }

    const insertId = results.insertId;

    return res.status(201).json({ message: 'Propriedade adicionada com sucesso!', insertId });
  });
});

// LISTAR PROPRIEDADES DO USUÁRIO
app.get('/properties', protect, (req: any, res: Response) => {
  const userId = req.user.id;
  db.query('SELECT * FROM properties WHERE user_id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar propriedades.' });

    const formatted = Array.isArray(results) ? (results as RowDataPacket[]).map((p: any) => ({
      ...p,
      latitude: typeof p.latitude === 'string' ? parseFloat(p.latitude) : p.latitude,
      longitude: typeof p.longitude === 'string' ? parseFloat(p.longitude) : p.longitude
    })) : [];
    return res.status(200).json(formatted);
  });
});

// DELETAR PROPRIEDADE -- INUTILIZADO
app.delete('/properties/:id', protect, (req: any, res: Response) => {
  const propertyId = Number(req.params.id); // garante que seja número
  const userId = req.user.id;

  db.query(
    'DELETE FROM properties WHERE id = ? AND user_id = ?',
    [propertyId, userId],
    (err, results: any) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao excluir propriedade.' });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({ message: 'Propriedade não encontrada.' });
      }

      // Retorna o ID deletado
      return res.status(200).json({ message: 'Propriedade excluída com sucesso.', deletedId: propertyId });
    }
  );
});


// Atualizar nome da propriedade
app.put('/properties/:id', protect, (req: any, res: Response) => {
  const propertyId = req.params.id;
  const { nome_propriedade } = req.body;

  if (!nome_propriedade || nome_propriedade.trim() === '') {
    return res.status(400).json({ message: 'O nome da propriedade não pode ser vazio.' });
  }

  const query = 'UPDATE properties SET nome_propriedade = ? WHERE id = ?';
  db.query(query, [nome_propriedade.trim(), propertyId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Erro ao atualizar nome da propriedade.' });
    return res.status(200).json({ message: 'Nome da propriedade atualizado com sucesso.', nome_propriedade });
  });
});

app.patch('/properties/:id/location', protect, (req: any, res: Response) => {
  const propertyId = req.params.id;
  const userId = req.user.id; // Obtido do token pelo middleware 'protect'
  const { latitude, longitude } = req.body;

  // 1. Validação básica
  if (!latitude || !longitude) {
    return res.status(400).json({ message: 'Latitude e Longitude são obrigatórias.' });
  }

  // 2. Atualiza no banco APENAS se o ID e o USER_ID corresponderem
  const query = 'UPDATE properties SET latitude = ?, longitude = ? WHERE id = ? AND user_id = ?';

  db.query(query, [latitude, longitude, propertyId, userId], (err, results: any) => {
    if (err) {
      console.error("Erro ao atualizar localização:", err);
      return res.status(500).json({ message: 'Erro interno ao atualizar localização.' });
    }

    // Se affectedRows for 0, significa que a propriedade não existe OU não pertence a esse usuário
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Propriedade não encontrada ou permissão negada.' });
    }

    return res.status(200).json({ message: 'Ponto de entrada atualizado com sucesso.' });
  });
});

app.get('/profile', protect, (req: any, res: Response) => {
  const userId = req.user.id; 

  // 1. MUDANÇA: Adicionei ', cpf' na consulta SQL
  db.query('SELECT id, nome_completo, email, cpf FROM users WHERE id = ?', [userId], (err, results: any) => {
    if (err) {
      console.error("Erro ao buscar perfil:", err);
      return res.status(500).json({ message: 'Erro ao buscar dados do perfil.' });
    }
    if (!results || results.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const user = results[0];

    // 2. LÓGICA HÍBRIDA (Igual à do Certificado):
    // Tenta pegar da coluna oficial 'cpf'. Se for null, tenta extrair do e-mail como fallback.
    let cpfFinal = user.cpf;
    
    if (!cpfFinal && user.email && user.email.includes('@')) {
        cpfFinal = user.email.split('@')[0];
    }

    return res.status(200).json({
      nome_completo: user.nome_completo,
      email: user.email,
      cpf: cpfFinal || 'Não informado' // Envia o CPF correto
    });
  });
});

app.get('/properties/:id/certificate', protect, (req: any, res: Response) => {
  const propertyId = req.params.id;
  const userId = req.user.id; 

  // 1. ATUALIZAÇÃO: Adicionamos 'u.cpf' de volta à consulta
  const query = `
    SELECT 
      p.car_code, p.nome_propriedade, p.latitude, p.longitude, p.plus_code,
      u.nome_completo, u.email, u.cpf
    FROM properties p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ? AND p.user_id = ? 
  `;

  db.query(query, [propertyId, userId], async (err, results: any) => {
    if (err) {
      console.error("Erro ao buscar dados para certificado:", err);
      return res.status(500).json({ message: 'Erro ao buscar dados da propriedade.' });
    }
    if (!results || results.length === 0) {
      return res.status(404).json({ message: 'Propriedade não encontrada ou não pertence a este usuário.' });
    }

    const data = results[0];

    // 2. LÓGICA HÍBRIDA DE CPF:
    // Prioridade 1: Coluna CPF do banco (Source of Truth)
    // Prioridade 2: Extração do E-mail (Fallback para usuários antigos/migrados)
    let cpfDoUsuario = data.cpf;

    if (!cpfDoUsuario && data.email && data.email.includes('@')) {
       cpfDoUsuario = data.email.split('@')[0];
    }

    try {
      await gerarCertificadoPDF(
        res,
        data.nome_completo,
        data.email,
        data.car_code,
        data.nome_propriedade,
        Number(data.latitude),
        Number(data.longitude),
        data.plus_code,
        cpfDoUsuario // Passa o CPF definitivo
      );
    } catch (pdfError) {
      console.error("Erro ao gerar PDF:", pdfError);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Erro ao gerar o certificado PDF.' });
      }
    }
  });
});


// PROPRIEDADES PÚBLICAS
app.get('/properties/public/markers', (req: Request, res: Response) => {
const query = `
  SELECT 
    p.id, p.user_id, p.car_code, p.nome_propriedade, 
    p.latitude, p.longitude, p.plus_code, 
    p.photo_url,  
    u.nome_completo AS owner_name 
  FROM properties p 
  JOIN users u ON p.user_id = u.id
`;
db.query(query, (err, results) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar propriedades públicas.' });

    const formatted = Array.isArray(results) ? (results as RowDataPacket[]).map((p: any) => ({
      ...p,
      latitude: typeof p.latitude === 'string' ? parseFloat(p.latitude) : p.latitude,
      longitude: typeof p.longitude === 'string' ? parseFloat(p.longitude) : p.longitude
    })) : [];
    return res.status(200).json(formatted);
  });
});

app.patch('/properties/public/:id/pluscode', (req: Request, res: Response) => {
  const { id } = req.params;
  const { plus_code } = req.body;

  if (!plus_code) {
    return res.status(400).json({ message: 'Plus Code ausente.' });
  }

  // Atualiza no banco de dados
  const query = 'UPDATE properties SET plus_code = ? WHERE id = ?';
  db.query(query, [plus_code, id], (err, results: any) => {
    if (err) {
      console.error("Erro ao salvar Plus Code:", err);
      return res.status(500).json({ message: 'Erro ao salvar Plus Code.' });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Propriedade não encontrada.' });
    }
    return res.status(200).json({ message: 'Plus Code atualizado com sucesso.' });
  });
});

app.get('/properties/public/boundaries', (req: Request, res: Response) => {
  const { minLat, maxLat, minLng, maxLng, latitudeDelta } = req.query;

  // 1. Validação
  if (!minLat || !maxLat || !minLng || !maxLng || !latitudeDelta) {
    return res.status(400).json({ message: 'Parâmetros de viewport (minLat, maxLat, minLng, maxLng, latitudeDelta) são obrigatórios.' });
  }

  // 2. Só retorna dados se o zoom estiver próximo (use a mesma constante do frontend)
  const POLYGON_ZOOM_THRESHOLD = 0.1; //
  const includeBoundary = parseFloat(latitudeDelta as string) < POLYGON_ZOOM_THRESHOLD;

  if (!includeBoundary) {
    return res.status(200).json([]); // Zoom muito longe, não retorna polígonos
  }

  // 3. Constrói a query (APENAS ID e BOUNDARY)
  const query = `
    SELECT p.id, p.boundary
    FROM properties p 
    WHERE 
      p.latitude BETWEEN ? AND ? AND
      p.longitude BETWEEN ? AND ?
      AND p.boundary IS NOT NULL 
  `;

  const values = [
    parseFloat(minLat as string),
    parseFloat(maxLat as string),
    parseFloat(minLng as string),
    parseFloat(maxLng as string)
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Erro na query de polígonos:", err);
      return res.status(500).json({ message: 'Erro ao buscar polígonos.' });
    }
    return res.status(200).json(results);
  });
});

app.get('/routes/custom', protect, async (req: any, res: Response) => {
  const { originId, destinationId, userLat, userLng } = req.query;

  // Validação: Precisa de pelo menos 2 pontos
  // Combinações válidas: (ID + ID) ou (ID + GPS)
  const hasOrigin = originId || (userLat && userLng);
  const hasDest = destinationId || (userLat && userLng);

  if (!hasOrigin || !hasDest) {
    return res.status(400).json({ message: 'Forneça Origem e Destino (ID ou GPS).' });
  }

  try {
    let startCoords: { latitude: number, longitude: number };
    let endCoords: { latitude: number, longitude: number };

    // --- 1. RESOLVER ORIGEM ---
    if (originId) {
      // Origem é uma Propriedade
      const result = await dbQuery('SELECT latitude, longitude FROM properties WHERE id = ?', [originId]);
      if (!result.length) return res.status(404).json({ message: 'Origem não encontrada.' });
      startCoords = { latitude: Number(result[0].latitude), longitude: Number(result[0].longitude) };
    } else {
      // Origem é GPS (Faz Snap)
      const rawLat = parseFloat(userLat);
      const rawLng = parseFloat(userLng);
      const snapped = await snapToNearestRoad(rawLat, rawLng);
      startCoords = snapped ? { latitude: snapped.lat, longitude: snapped.lng } : { latitude: rawLat, longitude: rawLng };
    }

    // --- 2. RESOLVER DESTINO ---
    if (destinationId) {
      // Destino é uma Propriedade
      const result = await dbQuery('SELECT latitude, longitude FROM properties WHERE id = ?', [destinationId]);
      if (!result.length) return res.status(404).json({ message: 'Destino não encontrado.' });
      endCoords = { latitude: Number(result[0].latitude), longitude: Number(result[0].longitude) };
    } else {
      // Destino é GPS (Faz Snap) -> NOVO CASO
      // Se chegamos aqui, significa que originId existe, então userLat é o destino
      const rawLat = parseFloat(userLat);
      const rawLng = parseFloat(userLng);
      const snapped = await snapToNearestRoad(rawLat, rawLng);
      endCoords = snapped ? { latitude: snapped.lat, longitude: snapped.lng } : { latitude: rawLat, longitude: rawLng };
    }

    // --- 3. CALCULAR ROTA ---
    const result = routeEngine.calculateRouteWithAlternatives(
      startCoords.latitude, startCoords.longitude,
      endCoords.latitude, endCoords.longitude
    );

    if (!result || !result.main) {
      return res.status(404).json({ message: 'Rota não encontrada.' });
    }

    // Pega o clima do destino final
    const weatherAlert = await getWeatherAlert(endCoords.latitude, endCoords.longitude);

    const responsePayload = {
      message: 'Sucesso',
      main: { ...result.main, alert: weatherAlert },
      alternative: result.alternative ? { ...result.alternative, alert: weatherAlert } : null
    };

    return res.status(200).json(responsePayload);

  } catch (error: any) {
    console.error("Erro rota:", error);
    return res.status(500).json({ message: 'Erro interno.' });
  }
});

// Autenticação via EMAIL

// 1. Estrutura atualizada para incluir o timestamp
const verificationCodes: { [email: string]: { code: string; timestamp: number } } = {};

// Constante para 10 minutos em milissegundos
const CODE_EXPIRATION_MS = 10 * 60 * 1000;

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post('/send-verification', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'E-mail é obrigatório' });

  // Gerar código aleatório de 6 dígitos
  const code = crypto.randomInt(100000, 999999).toString();

  // 2. Salvar código e timestamp
  verificationCodes[email] = {
    code,
    timestamp: Date.now()
  };

  try {
    await transporter.sendMail({
      from: `"GeoRah" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Código de Verificação GeoRah',
      text: `Seu código de verificação é: ${code}`,
      html: `<p>Seu código de verificação é: <b>${code}</b>. Este código expira em 10 minutos.</p>`, // (Adicionei um aviso no e-mail)
    });

    return res.status(200).json({ message: 'Código enviado com sucesso' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao enviar o código' });
  }
});

app.post('/verify-code', (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: 'Email e código são obrigatórios' });

  const entry = verificationCodes[email];
  if (!entry) return res.status(400).json({ message: 'Nenhum código solicitado para este e-mail' });

  // 3. Lógica de verificação de expiração
  const now = Date.now();
  const codeAge = now - entry.timestamp;

  if (codeAge > CODE_EXPIRATION_MS) {
    // Código está expirado
    delete verificationCodes[email]; // Limpa o código antigo
    return res.status(400).json({ message: 'Código expirado. Por favor, solicite um novo.' });
  }
  // Fim da lógica de expiração

  if (entry.code === code) {
    // Código válido: pode registrar o usuário
    delete verificationCodes[email]; // remove após verificação
    return res.status(200).json({ message: 'Código verificado com sucesso' });
  }

  return res.status(400).json({ message: 'Código inválido' });
});

// Função para obter as coordenadas da estrada mais próxima

async function snapToNearestRoad(lat: number, lng: number): Promise<{ lat: number, lng: number } | null> {
  try {
    // 1. Busca estradas num raio de 500 metros do usuário usando o MongoDB Geospatial
    const roads = await RoadModel.find({
      geometry: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] }, // Mongo usa [lng, lat]
          $maxDistance: 500 // Raio de busca em metros
        }
      }
    }).limit(5); // Pega as 5 mais próximas para verificar geometria fina

    if (!roads || roads.length === 0) return null;

    let bestPoint = { lat, lng };
    let minDistance = Infinity;

    // 2. Itera sobre as estradas encontradas para achar o segmento exato
    for (const road of roads) {
      const coords = road.geometry.coordinates; // Array de arrays [[lng, lat], [lng, lat]]
      
      // Suporte para LineString simples (array de pontos) ou MultiLineString (array de arrays de pontos)
      // Vou assumir LineString simples baseado no seu RoadModel, mas se for Multi, precisaria de mais um loop.
      const points = (road.geometry.type === 'MultiLineString') ? coords.flat() : coords;

      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];   // [lng, lat]
        const p2 = points[i+1]; // [lng, lat]

        // Usa sua função do geo.ts para projetar o ponto no segmento
        const snap = getNearestPointOnSegment(lat, lng, p1[1], p1[0], p2[1], p2[0]);
        
        // Calcula a distância real do usuário até esse ponto projetado
        const dist = getDistance(lat, lng, snap.latitude, snap.longitude);

        if (dist < minDistance) {
          minDistance = dist;
          bestPoint = { lat: snap.latitude, lng: snap.longitude };
        }
      }
    }

    console.log(`📍 Snap realizado: GPS(${lat}, ${lng}) -> Estrada(${bestPoint.lat}, ${bestPoint.lng}) dist: ${minDistance.toFixed(1)}m`);
    return bestPoint;

  } catch (error) {
    console.error("Erro no SnapToRoad:", error);
    return null; // Se der erro, retorna null (usaremos a coordenada original como fallback)
  }
}

app.post('/alerts', (req: Request, res: Response) => {
  const { lat, lng, type } = req.body;

  if (!lat || !lng || !type) {
    return res.status(400).json({ message: 'Dados incompletos.' });
  }

  if (alertStore.hasNearbyAlert(Number(lat), Number(lng), type)) {
    console.log(`🚫 Alerta rejeitado (Duplicado/Muito próximo): ${type}`);
    // Retornamos 409 (Conflict) para o frontend saber que já existe
    return res.status(409).json({ message: 'Este alerta já foi reportado recentemente neste local.' });
  }

  try {
    const newAlert = alertStore.addAlert(Number(lat), Number(lng), type);
    return res.status(201).json(newAlert);
  } catch (error) {
    console.error("Erro ao criar alerta:", error);
    return res.status(500).json({ message: 'Erro interno.' });
  }
});

app.get('/alerts', (req: Request, res: Response) => {
  const { lat, lng, radius } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Latitude e Longitude são obrigatórias para buscar alertas.' });
  }

  try {
    // Raio padrão de 50km se não for informado
    const searchRadius = radius ? Number(radius) : 50;
    
    const alerts = alertStore.getNearbyAlerts(Number(lat), Number(lng), searchRadius);
    return res.status(200).json(alerts);
  } catch (error) {
    console.error("Erro ao buscar alertas:", error);
    return res.status(500).json({ message: 'Erro ao buscar alertas.' });
  }
});

// --- 1. CONFIGURAÇÃO DO MULTER (UPLOAD MAIS SEGURO) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    
    // A MÁGICA: Cria a pasta se ela não existir
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      console.log("Pasta 'uploads' criada automaticamente.");
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg'; // Garante extensão
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// --- 2. SERVIR ARQUIVOS ESTÁTICOS (IMPORTANTE) ---
// Isso permite que o celular acesse a foto via http://ip:3000/uploads/foto.jpg
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// ... (suas rotas existentes) ...


// --- 3. NOVA ROTA DE UPLOAD DE FOTO ---
// Rota: POST /properties/:id/photo
app.post('/properties/:id/photo', protect, upload.single('photo'), (req: any, res: Response) => {
  const propertyId = req.params.id;
  
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhuma imagem enviada.' });
  }

  // O caminho que vamos salvar no banco (ex: uploads/photo-12345.jpg)
  // No Windows as barras vem invertidas (\), precisamos corrigir para (/) para funcionar na URL
  const photoPath = req.file.path.replace(/\\/g, "/");

  const query = 'UPDATE properties SET photo_url = ? WHERE id = ? AND user_id = ?';
  
  db.query(query, [photoPath, propertyId, req.user.id], (err, results: any) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Erro ao salvar caminho no banco.' });
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Propriedade não encontrada ou permissão negada.' });
    }

    // Retorna a URL completa para o frontend já mostrar
    // DICA: Se estiver no emulador, o IP deve ser ajustado no frontend, aqui mandamos o relativo
    res.status(200).json({ 
      message: 'Foto atualizada com sucesso!', 
      photo_url: photoPath 
    });
  });
});

// ERRO GLOBAL
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro inesperado:', err);
  res.status(500).json({ message: 'Ocorreu um erro inesperado.' });
});



const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
