FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY web/package*.json web/
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY web ./web
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm --workspace web run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web/.next ./web/.next
COPY --from=build /app/web/public ./web/public
COPY package*.json ./
COPY web/package*.json web/
COPY web/next.config.mjs web/
CMD ["npm", "--workspace", "web", "start"]
