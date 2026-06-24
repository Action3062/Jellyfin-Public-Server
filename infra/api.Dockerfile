FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY api/package*.json api/
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY api ./api
RUN npm --workspace api run prisma:generate && npm --workspace api run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/prisma ./api/prisma
COPY package*.json ./
COPY api/package*.json api/
CMD ["npm", "--workspace", "api", "start"]
