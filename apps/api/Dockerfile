FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
ENV DATA_DIR=/data
EXPOSE 8787
# Run node directly (not via npm/npx) so SIGTERM reaches the app and shutdowns are clean.
CMD ["node", "--import", "tsx", "src/index.ts"]
