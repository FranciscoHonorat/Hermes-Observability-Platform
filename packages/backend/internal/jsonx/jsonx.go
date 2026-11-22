// Package jsonx turns encoding/json decode errors into messages that are
// safe and useful to return to API clients.
package jsonx

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
)

// TypeError returns a message like `Field "value" must be a number` when err
// is a type mismatch on a named field, and ok=false otherwise.
func TypeError(err error) (msg string, ok bool) {
	var typeErr *json.UnmarshalTypeError
	if !errors.As(err, &typeErr) || typeErr.Field == "" {
		return "", false
	}
	return fmt.Sprintf("Field %q must be %s", typeErr.Field, kind(typeErr.Type)), true
}

func kind(t reflect.Type) string {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.String:
		return "a string"
	case reflect.Float32, reflect.Float64, reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "a number"
	case reflect.Bool:
		return "a boolean"
	case reflect.Slice, reflect.Array:
		return "an array"
	default:
		return "an object"
	}
}
