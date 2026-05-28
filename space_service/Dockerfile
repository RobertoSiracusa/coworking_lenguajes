# Etapa 1: compilar
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o space-service ./cmd/main.go

# Etapa 2: imagen final liviana (sin Go instalado)
FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/space-service .
EXPOSE 8002
CMD ["./space-service"]
