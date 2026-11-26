FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Jakarta

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "run", "start"]
