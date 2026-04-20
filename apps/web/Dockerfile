FROM node:20-alpine AS build
WORKDIR /app
ENV PUBLIC_SUPABASE_URL=https://db.poc.proximity.green
ENV PUBLIC_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NjUyMjk2MCwiZXhwIjo0OTMyMTk2NTYwLCJyb2xlIjoiYW5vbiJ9.A51K0FeE-rdQ64HiREX0bnOiNlMJx_ajhdD6jFApwmM
ENV SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NjUyMjk2MCwiZXhwIjo0OTMyMTk2NTYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.SlTs1ypSyFvbAPNaGleSaJW47THPM7PFhPEkldiwG-A
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/CHANGELOG.md ./CHANGELOG.md
COPY --from=build /app/package.json .
COPY --from=build /app/node_modules ./node_modules
ENV PORT=3000
ENV HOST=0.0.0.0
ENV PUBLIC_APP_URL=https://poc.proximity.green
ENV TRIGGER_SECRET_KEY=tr_dev_pkq8YUNNUayNgJhuZFJg
ENV TRIGGER_API_URL=https://jobs.poc.proximity.green
ENV PUBLIC_SUPABASE_URL=https://db.poc.proximity.green
ENV PUBLIC_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NjUyMjk2MCwiZXhwIjo0OTMyMTk2NTYwLCJyb2xlIjoiYW5vbiJ9.A51K0FeE-rdQ64HiREX0bnOiNlMJx_ajhdD6jFApwmM
ENV SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NjUyMjk2MCwiZXhwIjo0OTMyMTk2NTYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.SlTs1ypSyFvbAPNaGleSaJW47THPM7PFhPEkldiwG-A
EXPOSE 3000
CMD ["node", "build"]
