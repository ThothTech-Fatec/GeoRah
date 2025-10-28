import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const router = express.Router();

const verificationCodes: { [email: string]: string } = {};

// Configuração do Nodemailer (exemplo Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,  
    pass: process.env.EMAIL_PASS,  
  },
});

router.post('/send-verification', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'E-mail é obrigatório' });

  // Gerar código aleatório de 6 dígitos
  const code = crypto.randomInt(100000, 999999).toString();

  // Salvar código temporariamente
  verificationCodes[email] = code;

  try {
    await transporter.sendMail({
      from: `"GeoRah" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Código de Verificação GeoRah',
      text: `Seu código de verificação é: ${code}`,
      html: `<p>Seu código de verificação é: <b>${code}</b></p>`,
    });

    return res.status(200).json({ message: 'Código enviado com sucesso' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao enviar o código' });
  }
});

router.post('/verify-code', (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: 'Email e código são obrigatórios' });

  const validCode = verificationCodes[email];
  if (!validCode) return res.status(400).json({ message: 'Nenhum código encontrado para este e-mail' });

  if (validCode === code) {
    // Código válido: pode registrar o usuário
    delete verificationCodes[email]; // remove após verificação
    return res.status(200).json({ message: 'Código verificado com sucesso' });
  }

  return res.status(400).json({ message: 'Código inválido' });
});
