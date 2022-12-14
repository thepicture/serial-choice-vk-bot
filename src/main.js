const express = require("express");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

require("dotenv").config();

const bodyParser = require("body-parser");

const VkBot = require("node-vk-bot-api");
const Markup = require("node-vk-bot-api/lib/markup");
const Scene = require("node-vk-bot-api/lib/scene");
const Session = require("node-vk-bot-api/lib/session");
const Stage = require("node-vk-bot-api/lib/stage");

const app = express();
const bot = new VkBot({
  token: process.env["TOKEN"],
  confirmation: process.env["CONFIRMATION"],
});

const scene = new Scene(
  "start",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(
      process.env["START_RESPONSE"],
      null,
      Markup.keyboard([process.env["ACTION_FIND_MOVIE"]]).oneTime()
    );
  },
  (ctx) => {
    ctx.session.action = ctx.message.text;

    ctx.scene.next();
    ctx.reply(
      process.env["MOVIE_SEARCH_TYPE_RESPONSE"],
      null,
      Markup.keyboard([
        process.env["FIND_MOVIE_BY_NAME"],
        process.env["FIND_MOVIE_BY_ID"],
      ]).oneTime()
    );
  },
  (ctx) => {
    ctx.session.movieSearchType = ctx.message.text;

    ctx.scene.next();
    ctx.reply(process.env["ENTER_INPUT_RESPONSE"]);
  },
  async (ctx) => {
    ctx.session.query = ctx.message.text;

    ctx.scene.leave();
    if (ctx.session.action === process.env["ACTION_FIND_MOVIE"]) {
      if (ctx.session.movieSearchType === process.env["FIND_MOVIE_BY_NAME"]) {
        const url = `${process.env["BASE_URL"]}?keyword=${encodeURIComponent(
          ctx.session.query
        )}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "X-API-KEY": process.env["API_KEY"],
            "Content-Type": "application/json",
          },
        });
        const movies = (await response.json()).items;

        const movieNames = movies
          .map((film) => film.nameRu)
          .filter((name) => name && name.trim())
          .join(", ");
        return ctx.reply(`${process.env["FILMS_FOUND"]}: ${movieNames}`);
      } else if (
        ctx.session.movieSearchType === process.env["FIND_MOVIE_BY_ID"]
      ) {
      } else {
        ctx.reply(process.env["UNSUPPORTED_ACTION"]);
      }
    } else {
      ctx.reply(process.env["UNSUPPORTED_ACTION"]);
    }
  }
);

const session = new Session();
const stage = new Stage(scene);

bot.use(session.middleware());
bot.use(stage.middleware());

bot.command("/start", (ctx) => {
  ctx.scene.enter("start");
});

app.use(bodyParser.json());

app.post("/", bot.webhookCallback);

app.listen(+process.env["PORT"]);
