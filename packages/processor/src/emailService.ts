import nodemailer, { Transporter } from 'nodemailer';
import { Logger } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('EmailService');

let transporter: Transporter | null = null;

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

        logger.info('SMTP transporter configured', {
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
        if (!config.smtp.auth.user || !config.smtp.auth.pass) {
            logger.warn('SMTP credentials not configured. Email will not be sent.');
            logger.info(`[DEVELOPMENT MODE] Email for ${to}:`, { subject, htmlBody });
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
        
        logger.info('Email sent successfully', {
            to,
            subject,
            messageId: info.messageId
        });

    } catch (error: any) {
        logger.error('Error sending email:', {
            to,
            subject,
            error: error.message
        });
        throw error;
    }
}

export async function testSmtpConnection(): Promise<boolean> {
    try {
        if (!config.smtp.auth.user || !config.smtp.auth.pass) {
            logger.warn('SMTP credentials not configured');
            return false;
        }

        const transport = getTransporter();
        await transport.verify();
        logger.info('SMTP connection verified successfully');
        return true;
    } catch (error: any) {
        logger.error('Failed to verify SMTP connection:', error);
        return false;
    }
}