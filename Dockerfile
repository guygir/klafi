FROM node:22-alpine

WORKDIR /workspace/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app ./
COPY docs/design/assets /workspace/docs/design/assets

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
