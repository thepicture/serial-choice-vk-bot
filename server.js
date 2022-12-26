require("dotenv").config();

const express = require("express");
const app = express();

const bodyParser = require("body-parser");

const VkBot = require("node-vk-bot-api");
const Markup = require("node-vk-bot-api/lib/markup");
const Scene = require("node-vk-bot-api/lib/scene");
const Session = require("node-vk-bot-api/lib/session");
const Stage = require("node-vk-bot-api/lib/stage");

const { Attachment } = require("./src/adapters/attachments.js");

const locales = require("./src/locales.json");
const genres = require("./src/genres.json");
const movieTypes = require("./src/movie-types.json");

const { MovieFetcher } = require("./src/MovieFetcher.js");
const fetcher = new MovieFetcher({
  baseUrl: process.env["BASE_URL"],
  apiKey: process.env["API_KEY"],
});

const bot = new VkBot({
  token: process.env["TOKEN"],
  confirmation: process.env["CONFIRMATION"],
});

const getRatingScene = new Scene(
  "getRating",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(locales["ENTER_INPUT_RESPONSE"]);
  },
  async (ctx) => {
    ctx.session.query = ctx.message.text;
    ctx.scene.leave();

    const movies = await fetcher.getByKeyword(ctx.session.query);

    if (movies.length === 0) {
      return notFound(ctx);
    }

    const movie = movies[0];

    const movieMarkup = getShortMovieMarkup(movie);

    const userId = ctx.message.from_id || ctx.message.user_id;

    const attachment = await new Attachment(
      bot,
      movies[0].posterUrlPreview,
      userId
    ).getUrl();
    return ctx.reply(
      `${locales["HAVE_FOUND_RATING"]}\n${movieMarkup}`,
      attachment,
      Markup.keyboard([
        [Markup.button(locales["GET_MOVIES"])],
        [Markup.button(locales["SEARCH_RATING"])],
      ])
    );
  }
);

const pickScene = new Scene(
  "pick",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(
      `${locales["CHOOSE_GENRE"]}`,
      null,
      Markup.keyboard(
        genres
          .map(({ genre }) => genre)
          .filter((label) => !!label)
          .slice(0, 10)
          .map((label) => [Markup.button(label)])
      ).oneTime()
    );
  },
  (ctx) => {
    ctx.session.genre = ctx.message.text;

    ctx.scene.next();
    ctx.reply(
      `${locales["CHOOSE_TYPE"]}`,
      null,
      Markup.keyboard(
        movieTypes.map(({ label }) => label),
        { columns: 1 }
      ).oneTime()
    );
  },
  (ctx) => {
    ctx.session.type = ctx.message.text;

    ctx.scene.next();
    ctx.reply(
      `${locales["CHOOSE_RATING"]}`,
      null,
      Markup.keyboard(
        new Array(10)
          .fill(null)
          .map((_, index) => [Markup.button((index + 1).toString())])
      ).oneTime()
    );
  },
  async (ctx) => {
    ctx.session.rating = +ctx.message.text;

    ctx.scene.leave();
    notifyStartSearching(ctx);

    const genreId = genres.filter(({ genre }) => ctx.session.genre === genre)[0]
      .id;
    const movieType = movieTypes.filter(
      ({ label }) => ctx.session.type === label
    )[0].value;

    const rating = ctx.session.rating;

    const baseUrl = process.env["BASE_URL"];
    const movies = await fetcher.getByFilters({
      genreId,
      movieType,
      ratingFrom: rating,
      ratingTo: rating,
    });

    if (movies.length === 0) {
      return notFound(ctx);
    }

    const movie = await fetcher.getMovieByKinopoiskId(movies[0].kinopoiskId);

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
      `${locales["HAVE_FOUND_MOVIE"]}\n${movieMarkup}`,
      attachment,
      Markup.keyboard([
        [Markup.button(locales["GET_MORE_MOVIES"])],
        [Markup.button(locales["SEARCH_RATING"])],
      ])
    );
    return ctx.scene.leave();
  }
);

const startScene = new Scene(
  "start",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(
      `${locales["START_RESPONSE"]}`,
      null,
      Markup.keyboard([
        [Markup.button(locales["ACTION_FIND_MOVIE"])],
        [Markup.button(locales["ACTION_PICK_MOVIE"])],
        [Markup.button(locales["SEARCH_RATING"])],
      ]).oneTime()
    );
  },
  (ctx) => {
    if (ctx.message.text === locales["ACTION_PICK_MOVIE"]) {
      ctx.scene.leave();
      return ctx.scene.enter("pick");
    }

    if (ctx.message.text === locales["SEARCH_RATING"]) {
      ctx.scene.leave();
      return ctx.scene.enter("getRating");
    }

    ctx.session.action = locales["ACTION_FIND_MOVIE"];

    ctx.scene.next();
    ctx.reply(
      `${locales["MOVIE_SEARCH_TYPE_RESPONSE"]}`,
      null,
      Markup.keyboard([
        [Markup.button(locales["FIND_MOVIE_BY_NAME"])],
        [Markup.button(locales["FIND_MOVIE_BY_ID"])],
        [Markup.button(locales["RANDOM_MOVIE"])],
        [Markup.button(locales["SEARCH_RATING"])],
      ]).oneTime()
    );
  },
  async (ctx) => {
    ctx.session.movieSearchType = ctx.message.text;

    ctx.scene.next();

    if (ctx.session.movieSearchType === locales["RANDOM_MOVIE"]) {
      notifyStartSearching(ctx);
      const film = await fetcher.getRandomMovie();

      const kinopoiskId = film.filmId;

      const movie = await fetcher.getMovieByKinopoiskId(kinopoiskId);

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
        `${locales["HAVE_FOUND_MOVIE"]}\n${movieMarkup}`,
        attachment,
        Markup.keyboard([
          [Markup.button(locales["GET_MORE_MOVIES"])],
          [Markup.button(locales["SEARCH_RATING"])],
        ])
      );
      return ctx.scene.leave();
    }

    ctx.reply(`${locales["ENTER_INPUT_RESPONSE"]}`);
  },
  async (ctx) => {
    notifyStartSearching(ctx);
    const userId = ctx.message.from_id || ctx.message.user_id;

    ctx.session.query = ctx.message.text;

    ctx.scene.leave();

    if (ctx.session.action === locales["ACTION_FIND_MOVIE"]) {
      if (ctx.session.movieSearchType === locales["FIND_MOVIE_BY_NAME"]) {
        const movies = await fetcher.getByKeyword(ctx.session.query);

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
            `${locales["FILMS_FOUND"]}:\n${movieMarkup}`,
            attachment,
            Markup.keyboard([
              [Markup.button(locales["GET_MORE_MOVIES"])],
              [Markup.button(locales["SEARCH_RATING"])],
            ])
          );
        } else {
          return notFound(ctx);
        }
      } else if (ctx.session.movieSearchType === locales["FIND_MOVIE_BY_ID"]) {
        let movie;

        try {
          movie = await fetcher.getMovieByKinopoiskId(ctx.session.query);
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
          `${locales["FOUND_ABSTRACT"]}\n${movieMarkup}`,
          attachment,
          Markup.keyboard([
            [Markup.button(locales["GET_MORE_MOVIES"])],
            [Markup.button(locales["SEARCH_RATING"])],
          ])
        );
      } else if (ctx.session.movieSearchType === locales["SEARCH_RATING"]) {
        ctx.scene.leave();
        ctx.scene.enter("getRating", 1);
      } else {
        ctx.reply(locales["UNSUPPORTED_ACTION"]);
      }
    } else {
      ctx.reply(locales["UNSUPPORTED_ACTION"]);
    }
  }
);

const session = new Session();
const stage = new Stage(startScene, pickScene, getRatingScene);

bot.use(session.middleware());
bot.use(stage.middleware());

[
  "start",
  "/start",
  locales["START"],
  locales["START"].toLowerCase(),
  locales["GET_MORE_MOVIES"],
  locales["GET_MOVIES"],
].forEach((command) => {
  bot.command(command, (ctx) => {
    ctx.scene.enter("start");
  });
});

[locales["SEARCH_RATING"], locales["SEARCH_RATING"].toLowerCase()].forEach(
  (command) => {
    bot.command(command, (ctx) => {
      ctx.scene.enter("getRating");
    });
  }
);

function notifyStartSearching(ctx) {
  ctx.reply(`${locales["STARTED_SEARCH"]}`);
}

function getShortMovieMarkup(movie) {
  const ratingImdb = `${locales["IMDB"]}: ${
    movie.ratingImdb ? `${movie.ratingImdb}/10` : locales["NO_RATING"]
  }`;
  const ratingKinopoisk = `${locales["KINOPOISK"]}: ${
    movie.ratingKinopoisk ? `${movie.ratingKinopoisk}/10` : locales["NO_RATING"]
  }`;

  const tab = "⠀";

  return `${
    movie.nameRu || movie.nameEn || movie.nameOriginal
  }\n${tab}${ratingKinopoisk}\n${tab}${ratingImdb}`;
}

function getVerboseMovieMarkup(movie) {
  const ratingImdb = `${locales["IMDB"]}: ${
    movie.ratingImdb ? `${movie.ratingImdb}/10` : locales["NO_RATING"]
  }`;
  const ratingKinopoisk = `${locales["KINOPOISK"]}: ${
    movie.ratingKinopoisk ? `${movie.ratingKinopoisk}/10` : locales["NO_RATING"]
  }`;

  const movieMarkup = `${locales["FILM_INFO_TITLE"]} ${
    movie.nameRu || movie.nameEn || movie.nameOriginal
  }\n${ratingKinopoisk}\n${ratingImdb}\n${locales["RELEASED_IN"]} ${
    movie.year
  }\n${locales["GENRES"]}: ${movie.genres
    .map(({ genre }) => genre)
    .join(", ")}\n${locales["MORE_INFO"]}: ${movie.webUrl}`;

  return movieMarkup;
}

function notFound(ctx) {
  return ctx.reply(
    locales["NO_RESULTS"],
    null,
    Markup.keyboard([
      [Markup.button(locales["GET_MORE_MOVIES"])],
      [Markup.button(locales["SEARCH_RATING"])],
    ])
  );
}

app.use(bodyParser.json());
app.post("/", bot.webhookCallback);
app.listen(+process.env["PORT"]);
