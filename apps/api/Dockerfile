FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
ENV DATA_DIR=/data
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
