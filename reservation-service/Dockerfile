# Etapa 1: compilar con Maven
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn package -DskipTests

# Etapa 2: imagen final liviana
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/reservation-service-2.0.0.jar app.jar
EXPOSE 8003
ENTRYPOINT ["java", "-jar", "app.jar"]
