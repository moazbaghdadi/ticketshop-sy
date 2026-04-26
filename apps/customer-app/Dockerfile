# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
ARG API_URL=https://tickets-api.ce-svcs.cc/api/v1
WORKDIR /repo

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY apps/customer-app/package.json apps/customer-app/
COPY apps/admin-dashboard/package.json apps/admin-dashboard/
COPY libs/shared-models/package.json libs/shared-models/
COPY libs/shared-ui/package.json libs/shared-ui/

RUN npm ci

COPY libs/ libs/
COPY apps/customer-app/ apps/customer-app/

RUN sed -i "s|https://accomplished-determination-production.up.railway.app/api/v1|${API_URL}|g" \
      apps/customer-app/src/environments/environment.ts \
 && npm run build:app

FROM nginx:1.27-alpine AS runtime
COPY apps/customer-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/customer-app/dist/ticketshop-sy/browser /usr/share/nginx/html
EXPOSE 80
