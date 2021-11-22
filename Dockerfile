FROM node:12.18-alpine
ENV NODE_ENV=production
ENV UPDATE_RATE=25
WORKDIR /usr/src/app
COPY ["./package.json", "./yarn.lock", "./.env", "npm-shrinkwrap.json*", "./"]
RUN yarn install --prod
COPY . .
RUN yarn build
EXPOSE 5555
CMD ["yarn", "start"]
