// Package pg holds Postgres helpers shared by the services.
package pg

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

func code(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

// IsPermanent reports errors caused by the data itself (SQLSTATE class 22
// data exception, 23 integrity violation), which retrying will not fix.
func IsPermanent(err error) bool {
	c := code(err)
	return len(c) == 5 && (c[:2] == "22" || c[:2] == "23")
}

func IsUniqueViolation(err error) bool { return code(err) == "23505" }
