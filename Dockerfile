FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
