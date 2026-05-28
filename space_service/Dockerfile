# Etapa 1: compilar
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY . .
ENV GOFLAGS=-mod=mod
RUN go build -o space-service ./cmd/main.go

# Etapa 2: imagen final liviana (sin Go instalado)
FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/space-service .
EXPOSE 8002
CMD ["./space-service"]
