package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Time marshals like JavaScript's Date.toJSON() (UTC, millisecond
// precision), the format the dashboard has always received.
type Time struct{ time.Time }

func (t Time) MarshalJSON() ([]byte, error) {
	return []byte(`"` + t.UTC().Format("2006-01-02T15:04:05.000Z") + `"`), nil
}

// Scan lets pgx scan timestamptz columns into Time.
func (t *Time) Scan(src any) error {
	v, ok := src.(time.Time)
	if !ok {
		return fmt.Errorf("cannot scan %T into api.Time", src)
	}
	t.Time = v
	return nil
}

// where accumulates SQL conditions with positional arguments. Building the
// clause per request (rather than "$2 IS NULL OR col = $2") keeps each
// filter combination able to use its index.
type where struct {
	conds []string
	args  []any
}

// add appends cond, replacing "?" with the next placeholder.
func (w *where) add(cond string, arg any) {
	w.args = append(w.args, arg)
	w.conds = append(w.conds, strings.Replace(cond, "?", "$"+strconv.Itoa(len(w.args)), 1))
}

// next appends an argument outside the WHERE clause (LIMIT, OFFSET...) and
// returns its placeholder.
func (w *where) next(arg any) string {
	w.args = append(w.args, arg)
	return "$" + strconv.Itoa(len(w.args))
}

func (w *where) sql() string { return "WHERE " + strings.Join(w.conds, " AND ") }

// queryInt reads a non-negative integer parameter, clamped to max.
func queryInt(r *http.Request, name string, fallback, max int) (int, error) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return 0, badRequest(name + " must be a non-negative integer")
	}
	return min(n, max), nil
}

// queryMillis reads an epoch-milliseconds parameter (the UI's from/to).
func queryMillis(r *http.Request, name string) (*time.Time, error) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return nil, nil
	}
	ms, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return nil, badRequest(name + " must be a timestamp in milliseconds")
	}
	t := time.UnixMilli(int64(ms)).UTC()
	return &t, nil
}

func pathID(r *http.Request, name string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		return 0, badRequest(name + " must be a positive integer")
	}
	return id, nil
}

// collect runs a query and scans every row into T by column name.
func collect[T any](ctx context.Context, q querier, sql string, args ...any) ([]T, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[T])
	if out == nil {
		out = []T{} // encode as [] rather than null
	}
	return out, err
}

// collectOne returns the single row, or ok=false when there is none.
func collectOne[T any](ctx context.Context, q querier, sql string, args ...any) (T, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		var zero T
		return zero, false, err
	}
	v, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[T])
	if err == pgx.ErrNoRows {
		return v, false, nil
	}
	return v, err == nil, err
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// list is the {"<key>": [...], "count": n} envelope most endpoints return.
func list[T any](key string, items []T) map[string]any {
	return map[string]any{key: items, "count": len(items)}
}
