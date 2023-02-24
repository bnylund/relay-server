FROM node:16
ENV NODE_ENV=production
ENV UPDATE_RATE=25
WORKDIR /usr/src/app
COPY ["./package.json", "./yarn.lock", "npm-shrinkwrap.json*", "./"]
RUN yarn
COPY . .
RUN yarn build
EXPOSE 5000
CMD ["yarn", "start:prod"]
