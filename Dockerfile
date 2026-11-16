FROM node:22-alpine AS builder
WORKDIR /app

# Build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /data/uploads /data/invoices
VOLUME ["/data"]

EXPOSE 3000
CMD ["npm", "run", "start"]
