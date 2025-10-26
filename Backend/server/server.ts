// backend/server.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import { protect } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("A chave JWT_SECRET não está definida no arquivo .env");

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

/**
 * Gera um certificado em PDF com layout elegante e envia por email.
 * O certificado contém: nome do usuário, CPF (extraído do e-mail),
 * código CAR, nome da propriedade, latitude, longitude e plus code.
 */
async function enviarCertificado(
  nome: string,
  email: string,
  carCode: string,
  nomePropriedade: string,
  latitude: number,
  longitude: number,
  plusCode: string
): Promise<void> {
  const safeName = nome.replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
  const fileName = `certificado_${safeName}_${carCode}.pdf`;
  const pdfPath = path.join(__dirname, fileName);

  // Cria documento
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  // Layout: borda / moldura
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  doc.save();
  doc.lineWidth(2);
  doc.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 8).stroke('#0B5FFF'); // moldura azul
  doc.restore();

  // Cabeçalho com fundo
  const headerHeight = 110;
  doc.rect(20, 20, pageWidth - 40, headerHeight).fillAndStroke('#0B5FFF', '#0B5FFF');
  // Logo (opcional)
  const logoPath = path.join(__dirname, 'assets', 'logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 40, 30, { fit: [90, 90] });
    } catch (e) {
      // ignorar erro de imagem
    }
  }

  // Título do certificado no cabeçalho
  doc.fillColor('white');
  doc.font('Helvetica-Bold').fontSize(20);
  doc.text('CERTIFICADO DE CADASTRO DE PROPRIEDADE', 150, 44, {
    width: pageWidth - 200,
    align: 'center'
  });

  // Subtítulo / organização
  doc.font('Helvetica').fontSize(10);
  doc.text('GeoRah — Map e Cadastro Rural Inteligente', 150, 70, {
    width: pageWidth - 200,
    align: 'center'
  });

  doc.fillColor('black');

  // Corpo do certificado
  let y = 150;
  doc.moveTo(40, y - 8);

  doc.font('Helvetica').fontSize(12);
  doc.text('Certificamos que o(a) proprietário(a):', 60, y, { continued: false });
  y += 22;

  // Nome do usuário em destaque
  doc.font('Helvetica-Bold').fontSize(18);
  doc.text(nome, 60, y, { underline: true });
  y += 30;

  // Informações principais em um "card"
  const leftX = 60;
  const rightX = pageWidth / 2 + 10;
  const lineHeight = 18;
  doc.font('Helvetica').fontSize(12);

  // CPF extraído do e-mail (se o email tiver local-part representando o CPF)
  const cpfExtraido = typeof email === 'string' && email.includes('@') ? email.split('@')[0] : '---';

  // Coluna esquerda
  doc.text(`Código CAR:`, leftX, y);
  doc.font('Helvetica-Bold').text(`${carCode}`, leftX + 100, y);
  y += lineHeight;

  doc.font('Helvetica').text(`Nome da Propriedade:`, leftX, y);
  doc.font('Helvetica-Bold').text(`${nomePropriedade}`, leftX + 150, y);
  y += lineHeight;

  // Coluna direita (mesma linha inicial)
  y = 182;
  doc.font('Helvetica').text(`Latitude:`, rightX, y);
  doc.font('Helvetica-Bold').text(`${latitude}`, rightX + 70, y);
  y += lineHeight;

  doc.font('Helvetica').text(`Longitude:`, rightX, y);
  doc.font('Helvetica-Bold').text(`${longitude}`, rightX + 80, y);
  y += lineHeight;

  doc.font('Helvetica').text(`Plus Code:`, rightX, y);
  doc.font('Helvetica-Bold').text(`${plusCode}`, rightX + 80, y);
  y += lineHeight;

  // Avança o cursor para a próxima área
  y = Math.max(y, 240);
  doc.moveDown(1);

  // Linha separadora
  doc.moveTo(60, y).lineTo(pageWidth - 60, y).dash(2, { space: 2 }).stroke('#CCCCCC').undash();
  y += 12;

  // Campo CPF e Declaração
  doc.font('Helvetica').fontSize(12);
  doc.text(`CPF (extraído do e-mail): `, 60, y);
  doc.font('Helvetica-Bold').text(cpfExtraido, 220, y);
  y += 26;

  doc.font('Helvetica').fontSize(11);
  const declaration = `As informações acima correspondem ao registro realizado na plataforma GeoRah. Este certificado atesta que os dados da propriedade foram registrados sob responsabilidade do usuário.`;
  doc.text(declaration, 60, y, { align: 'justify', width: pageWidth - 120 });
  y += 60;

  // Rodapé: data e assinatura
  const issueDate = new Date().toLocaleDateString('pt-BR');
  doc.font('Helvetica-Oblique').fontSize(10);
  doc.text(`Emitido em: ${issueDate}`, 60, pageHeight - 120);

  // Área de assinatura (centro-direita)
  const signX = pageWidth - 260;
  const signY = pageHeight - 160;
  doc.moveTo(signX, signY).lineTo(signX + 180, signY).stroke('#000000');
  doc.font('Helvetica').fontSize(11).text('Assinatura digital: GeoRah', signX, signY + 6, { width: 180, align: 'center' });

  // Pequeno selo / nota
  doc.font('Helvetica').fontSize(8).fillColor('#666666')
    .text('Certificado gerado automaticamente pelo sistema GeoRah', 60, pageHeight - 80);

  // Finaliza
  doc.end();

  // espera
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', err => reject(err));
  });

  // Envia email com nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"GeoRah" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Certificado de Cadastro de Propriedade - GeoRah',
    text: `Olá ${nome},\n\nParabéns! O certificado de cadastro da sua propriedade "${nomePropriedade}" está em anexo.\n\nAtenciosamente,\nEquipe GeoRah`,
    attachments: [{ filename: fileName, path: pdfPath }],
  });

  // remove temporário
  try { fs.unlinkSync(pdfPath); } catch { /* ignore */ }
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

// REGISTRO DE USUÁRIO
app.post('/register', (req: Request, res: Response) => {
  const { nome_completo, email, senha } = req.body;
  if (!nome_completo || !email || !senha) return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });

  bcrypt.hash(senha, 10, (err, hash) => {
    if (err) return res.status(500).json({ message: 'Erro ao criptografar a senha.' });

    db.query('INSERT INTO users (nome_completo, email, senha) VALUES (?, ?, ?)', [nome_completo, email, hash], (err) => {
      if (err) {
        if ((err as any).code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Este email já está cadastrado.' });
        return res.status(500).json({ message: 'Erro ao registrar usuário.', error: err });
      }

      return res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    });
  });
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

    // busca dados do usuário para montar o certificado
    db.query('SELECT nome_completo, email FROM users WHERE id = ?', [userId], async (err, users: any) => {
      if (!err && users && users.length > 0) {
        const { nome_completo, email } = users[0];
        // envia certificado (não bloqueante para a resposta)
        try {
          await enviarCertificado(nome_completo, email, car_code, nome_propriedade, Number(latitude), Number(longitude), plus_code);
          console.log(`📄 Certificado enviado para ${email}`);
        } catch (e) {
          console.error('Erro ao enviar certificado após cadastro de propriedade:', e);
        }
      }
    });

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

// DELETAR PROPRIEDADE
app.delete('/properties/:id', protect, (req: any, res: Response) => {
  const propertyId = req.params.id;
  const userId = req.user.id;
  db.query('DELETE FROM properties WHERE id = ? AND user_id = ?', [propertyId, userId], (err, results: any) => {
    if (err) return res.status(500).json({ message: 'Erro ao excluir propriedade.' });
    if (results.affectedRows === 0) return res.status(404).json({ message: 'Propriedade não encontrada.' });
    return res.status(200).json({ message: 'Propriedade excluída com sucesso.' });
  });
});

// PROPRIEDADES PÚBLICAS
app.get('/properties/public/markers', (req: Request, res: Response) => {
  const query = `
    SELECT 
      p.id, p.user_id, p.car_code, p.nome_propriedade, 
      p.latitude, p.longitude, p.plus_code, 
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

app.get('/properties/public/boundaries', (req: Request, res: Response) => {
  const { minLat, maxLat, minLng, maxLng, latitudeDelta } = req.query;

  // 1. Validação
  if (!minLat || !maxLat || !minLng || !maxLng || !latitudeDelta) {
    return res.status(400).json({ message: 'Parâmetros de viewport (minLat, maxLat, minLng, maxLng, latitudeDelta) são obrigatórios.' });
  }

  // 2. Só retorna dados se o zoom estiver próximo (use a mesma constante do frontend)
  const POLYGON_ZOOM_THRESHOLD = 0.05; //
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

// ERRO GLOBAL
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro inesperado:', err);
  res.status(500).json({ message: 'Ocorreu um erro inesperado.' });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
