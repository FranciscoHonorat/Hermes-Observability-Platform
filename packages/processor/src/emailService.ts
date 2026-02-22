import nodemailer, { Transporter } from 'nodemailer';
import { Logger } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('EmailService');

let transporter: Transporter | null = null;

// Inicializar transporter do Nodemailer
function getTransporter(): Transporter {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            auth: config.smtp.auth.user && config.smtp.auth.pass ? {
                user: config.smtp.auth.user,
                pass: config.smtp.auth.pass
            } : undefined
        });

        logger.info('Transporter SMTP configurado', {
            host: config.smtp.host,
            port: config.smtp.port
        });
    }

    return transporter;
}

export async function sendAlertEmail(
    to: string, 
    subject: string, 
    htmlBody: string
): Promise<void> {
    try {
        // Verificar se as credenciais SMTP estão configuradas
        if (!config.smtp.auth.user || !config.smtp.auth.pass) {
            logger.warn('Credenciais SMTP não configuradas. Email não será enviado.');
            logger.info(`[MODO DESENVOLVIMENTO] Email para ${to}:`, { subject, htmlBody });
            return;
        }

        const transport = getTransporter();

        const mailOptions = {
            from: config.smtp.from,
            to,
            subject,
            html: htmlBody
        };

        const info = await transport.sendMail(mailOptions);
        
        logger.info('Email enviado com sucesso', {
            to,
            subject,
            messageId: info.messageId
        });

    } catch (error: any) {
        logger.error('Erro ao enviar email:', {
            to,
            subject,
            error: error.message
        });
        throw error;
    }
}

// Função para testar a configuração SMTP
export async function testSmtpConnection(): Promise<boolean> {
    try {
        if (!config.smtp.auth.user || !config.smtp.auth.pass) {
            logger.warn('Credenciais SMTP não configuradas');
            return false;
        }

        const transport = getTransporter();
        await transport.verify();
        logger.info('Conexão SMTP verificada com sucesso');
        return true;
    } catch (error: any) {
        logger.error('Falha ao verificar conexão SMTP:', error);
        return false;
    }
}