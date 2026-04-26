# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY apps/customer-app/package.json apps/customer-app/
COPY apps/admin-dashboard/package.json apps/admin-dashboard/
COPY libs/shared-models/package.json libs/shared-models/
COPY libs/shared-ui/package.json libs/shared-ui/

RUN npm ci

COPY libs/ libs/
COPY backend/ backend/

RUN npm run build:backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY apps/customer-app/package.json apps/customer-app/
COPY apps/admin-dashboard/package.json apps/admin-dashboard/
COPY libs/shared-models/package.json libs/shared-models/
COPY libs/shared-ui/package.json libs/shared-ui/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/backend/dist ./backend/dist
COPY --from=build /repo/libs ./libs

EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
