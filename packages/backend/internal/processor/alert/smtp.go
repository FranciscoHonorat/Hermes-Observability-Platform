package alert

import (
	"context"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

type SMTPConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	From     string
}

// SMTPNotifier sends HTML email. net/smtp upgrades to STARTTLS when the
// server offers it (port 587), matching nodemailer's secure:false setup.
type SMTPNotifier struct {
	cfg SMTPConfig
}

func NewSMTPNotifier(cfg SMTPConfig) *SMTPNotifier { return &SMTPNotifier{cfg: cfg} }

func (n *SMTPNotifier) Send(ctx context.Context, to, subject, htmlBody string) error {
	if strings.ContainsAny(to, "\r\n") {
		return fmt.Errorf("invalid recipient %q", to)
	}
	msg := strings.Join([]string{
		"From: " + n.cfg.From,
		"To: " + to,
		"Subject: " + mime.QEncoding.Encode("utf-8", subject),
		"Date: " + time.Now().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		`Content-Type: text/html; charset="utf-8"`,
		"",
		htmlBody,
	}, "\r\n")

	auth := smtp.PlainAuth("", n.cfg.User, n.cfg.Password, n.cfg.Host)
	addr := net.JoinHostPort(n.cfg.Host, n.cfg.Port)

	// smtp.SendMail has no context support; bound it so a hung server can't
	// stall the alert loop forever.
	done := make(chan error, 1)
	go func() { done <- smtp.SendMail(addr, auth, n.cfg.From, []string{to}, []byte(msg)) }()
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("send to %s: %w", to, ctx.Err())
	}
}

// LogNotifier is used when SMTP credentials are not configured: it logs the
// email instead of sending it, like the Node processor's development mode.
type LogNotifier struct {
	Log *slog.Logger
}

func (n LogNotifier) Send(_ context.Context, to, subject, htmlBody string) error {
	n.Log.Info("SMTP not configured; email not sent", "to", to, "subject", subject, "body", htmlBody)
	return nil
}
