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
ARG NEXT_PUBLIC_SHOP_NAME="Byteflix"
ARG NEXT_PUBLIC_SHOP_DISCORD_URL=""
ENV API_URL=$API_URL
ENV NEXT_PUBLIC_SHOP_NAME=$NEXT_PUBLIC_SHOP_NAME
ENV NEXT_PUBLIC_SHOP_DISCORD_URL=$NEXT_PUBLIC_SHOP_DISCORD_URL
# Pull the Higgsfield artwork into public/assets (soft-fails to gradients).
RUN node web/scripts/fetch-assets.mjs || true
RUN npm --workspace web run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/web/.next ./web/.next
COPY --from=build --chown=node:node /app/web/public ./web/public
COPY --chown=node:node package*.json ./
COPY --chown=node:node web/package*.json web/
COPY --chown=node:node web/next.config.mjs web/
USER node
CMD ["npm", "--workspace", "web", "start"]
