# Imagen base liviana
FROM node:20-alpine

WORKDIR /app

# Cache de dependencias
COPY package*.json ./
RUN npm install --production

# Copiar codigo
COPY src/ ./src/

EXPOSE 8004

CMD ["node", "src/index.js"]
