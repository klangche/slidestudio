FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
