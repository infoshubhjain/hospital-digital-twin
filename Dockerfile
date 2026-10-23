FROM node:25-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:25-alpine
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
EXPOSE 3001
RUN addgroup -S app && adduser -S -G app app
USER app
CMD ["node", "--import", "tsx", "server/index.ts"]
