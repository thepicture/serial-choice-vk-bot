require("dotenv").config();

const express = require("express");
const app = express();

const bodyParser = require("body-parser");

const strings = require("./src/strings.json");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const VkBot = require("node-vk-bot-api");
const Markup = require("node-vk-bot-api/lib/markup");
const Scene = require("node-vk-bot-api/lib/scene");
const Session = require("node-vk-bot-api/lib/session");
const Stage = require("node-vk-bot-api/lib/stage");

const { Attachment } = require("./src/adapters/attachments.js");

const bot = new VkBot({
  token: process.env["TOKEN"],
  confirmation: process.env["CONFIRMATION"],
});

const scene = new Scene(
  "start",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(
      `🤖${strings["START_RESPONSE"]}`,
      null,
      Markup.keyboard([strings["ACTION_FIND_MOVIE"]]).oneTime()
    );
  },
  (ctx) => {
    ctx.session.action = strings["ACTION_FIND_MOVIE"];

    ctx.scene.next();
    ctx.reply(
      `🔍${strings["MOVIE_SEARCH_TYPE_RESPONSE"]}`,
      null,
      Markup.keyboard([
        [
          Markup.button(strings["FIND_MOVIE_BY_NAME"]),
          Markup.button(strings["FIND_MOVIE_BY_ID"]),
        ],
        [
          Markup.button(strings["RANDOM_MOVIE"]),
          Markup.button(strings["SEARCH_RATING"]),
        ],
      ]).oneTime()
    );
  },
  async (ctx) => {
    ctx.session.movieSearchType = ctx.message.text;

    ctx.scene.next();

    if (ctx.session.movieSearchType === strings["RANDOM_MOVIE"]) {
      notifyStartSearching(ctx);
      const baseUrl = process.env["BASE_URL"];
      const response = await fetch(`${baseUrl}/top`, {
        method: "GET",
        headers: {
          "X-API-KEY": process.env["API_KEY"],
          "Content-Type": "application/json",
        },
      });

      const movies = await response.json();

      const { films } = movies;

      films.sort(() => (Math.random() > 0.5 ? 1 : -1));

      const film = films.pop();

      const randomMovieId = film.filmId;

      const movie = await (
        await fetch(`${baseUrl}/${randomMovieId}`, {
          method: "GET",
          headers: {
            "X-API-KEY": process.env["API_KEY"],
            "Content-Type": "application/json",
          },
        })
      ).json();

      const movieMarkup = getVerboseMovieMarkup(movie);

      let attachment = "";
      if (movie.posterUrlPreview) {
        const userId = ctx.message.from_id || ctx.message.user_id;
        attachment = await new Attachment(
          bot,
          movie.posterUrlPreview,
          userId
        ).getUrl();
      }

      ctx.reply(
        `${strings["HAVE_FOUND_MOVIE"]}\n${movieMarkup}`,
        attachment,
        Markup.keyboard([strings["GET_MORE_MOVIES"]])
      );
      return ctx.scene.leave();
    }

    ctx.reply(`✏️${strings["ENTER_INPUT_RESPONSE"]}`);
  },
  async (ctx) => {
    notifyStartSearching(ctx);
    const userId = ctx.message.from_id || ctx.message.user_id;

    ctx.session.query = ctx.message.text;

    ctx.scene.leave();

    if (ctx.session.action === strings["ACTION_FIND_MOVIE"]) {
      if (ctx.session.movieSearchType === strings["FIND_MOVIE_BY_NAME"]) {
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

        const movieMarkup = movies
          .map(getShortMovieMarkup)
          .map((markup, index) => `${index + 1}. ${markup}`)
          .join("\n");

        let attachment = "";
        if (movies.length > 0) {
          attachment = await new Attachment(
            bot,
            movies[0].posterUrlPreview,
            userId
          ).getUrl();
          return ctx.reply(
            `${strings["FILMS_FOUND"]}:\n${movieMarkup}`,
            attachment,
            Markup.keyboard([strings["GET_MORE_MOVIES"]])
          );
        } else {
          return notFound(ctx);
        }
      } else if (ctx.session.movieSearchType === strings["FIND_MOVIE_BY_ID"]) {
        const url = `${process.env["BASE_URL"]}/${ctx.session.query}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "X-API-KEY": process.env["API_KEY"],
            "Content-Type": "application/json",
          },
        });

        let movie;

        try {
          movie = await response.json();
        } catch {
          return notFound(ctx);
        }

        if (!movie || movie.message) {
          return notFound(ctx);
        }

        const movieMarkup = getVerboseMovieMarkup(movie);

        let attachment = "";
        if (movie.posterUrlPreview) {
          attachment = await new Attachment(
            bot,
            movie.posterUrlPreview,
            userId
          ).getUrl();
        }

        return ctx.reply(
          `Нашёл!\n${movieMarkup}`,
          attachment,
          Markup.keyboard([strings["GET_MORE_MOVIES"]])
        );
      } else if (ctx.session.movieSearchType === strings["SEARCH_RATING"]) {
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
        let movies = (await response.json()).items;
        if (movies.length === 0) {
          return notFound(ctx);
        }
        const movie = movies[0];

        const movieMarkup = getShortMovieMarkup(movie);

        const attachment = await new Attachment(
          bot,
          movies[0].posterUrlPreview,
          userId
        ).getUrl();
        return ctx.reply(
          `${strings["HAVE_FOUND_RATING"]}\n${movieMarkup}`,
          attachment,
          Markup.keyboard([strings["GET_MOVIES"]])
        );
      } else {
        ctx.reply(strings["UNSUPPORTED_ACTION"]);
      }
    } else {
      ctx.reply(strings["UNSUPPORTED_ACTION"]);
    }
  }
);

const session = new Session();
const stage = new Stage(scene);

bot.use(session.middleware());
bot.use(stage.middleware());

["start", "/start", strings["START"]].forEach((command) => {
  bot.command(command, (ctx) => {
    ctx.scene.enter("start");
  });
});

[strings["GET_MORE_MOVIES"], strings["GET_MOVIES"]].forEach((command) => {
  bot.command(command, (ctx) => {
    ctx.scene.enter("start", 1);
  });
});

function notifyStartSearching(ctx) {
  ctx.reply(`🕵${strings["STARTED_SEARCH"]}`);
}

function getShortMovieMarkup(movie) {
  const ratingImdb = `⭐${strings["IMDB"]}: ${
    movie.ratingImdb ? `${movie.ratingImdb}/10` : strings["NO_RATING"]
  }`;
  const ratingKinopoisk = `🎬${strings["KINOPOISK"]}: ${
    movie.ratingKinopoisk ? `${movie.ratingKinopoisk}/10` : strings["NO_RATING"]
  }`;

  const tab = "⠀";

  return `${
    movie.nameRu || movie.nameEn
  }\n${tab}${ratingKinopoisk}\n${tab}${ratingImdb}`;
}

function getVerboseMovieMarkup(movie) {
  const ratingImdb = `⭐${strings["IMDB"]}: ${
    movie.ratingImdb ? `${movie.ratingImdb}/10` : strings["NO_RATING"]
  }`;
  const ratingKinopoisk = `🎬${strings["KINOPOISK"]}: ${
    movie.ratingKinopoisk ? `${movie.ratingKinopoisk}/10` : strings["NO_RATING"]
  }`;

  const movieMarkup = `🎥${
    movie.nameRu || movie.nameEn
  }\n${ratingKinopoisk}\n${ratingImdb}\n${strings["RELEASED_IN"]} ${
    movie.year
  }\n${strings["GENRES"]}: ${movie.genres
    .map((genre) => genre.genre)
    .join(", ")}\n${strings["MORE_INFO"]}: ${movie.webUrl}`;

  return movieMarkup;
}

function notFound(ctx) {
  return ctx.reply(
    strings["NO_RESULTS"],
    null,
    Markup.keyboard([strings["GET_MORE_MOVIES"]])
  );
}

app.use(bodyParser.json());
app.post("/", bot.webhookCallback);
app.listen(+process.env["PORT"]);
