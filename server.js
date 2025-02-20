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

const { Logger } = require("./src/loggers/logger.js");

const { SpellChecker } = require("./src/SpellChecker.js");

const logger = new Logger();

const spellChecker = new SpellChecker();

const locales = require("./src/locales.json");
const genres = require("./src/genres.json");
const movieTypes = require("./src/movie-types.json");

const { MovieFetcher } = require("./src/MovieFetcher.js");
const { StaffFetcher } = require("./src/StaffFetcher.js");
const {
  InputParser,
  EmptyArrayError,
  EmptyStringError,
} = require("./src/InputParser.js");

const {
  PodcastFetcher,
  PodcastNotFoundError,
} = require("./src/PodcastFetcher");

const { BestMovieCalculator } = require("./src/BestMovieCalculator.js");

const movieFetcher = new MovieFetcher({
  baseUrl: process.env["BASE_URL"],
  apiKey: process.env["API_KEY"],
});

const staffFetcher = new StaffFetcher({
  baseUrl: process.env["STAFF_BASE_URL"],
  apiKey: process.env["API_KEY"],
});

const inputParser = new InputParser();

const bot = new VkBot({
  token: process.env["TOKEN"],
  confirmation: process.env["CONFIRMATION"],
});

const podcastFetcher = new PodcastFetcher(bot);

const smartMoviePickScene = new Scene(
  "smartMoviePick",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(locales["ENTER_FAVORITE_MOVIES"]);
  },
  (ctx) => {
    try {
      ctx.session.favoriteMovies = inputParser.parseCommaSeparatedValues(
        ctx.message.text
      );

      ctx.scene.next();
      ctx.reply(
        locales["SHOULD_BOT_USE_GENRES"],
        null,
        Markup.keyboard([
          [Markup.button(locales["YES"])],
          [Markup.button(locales["NO"])],
        ])
      );
    } catch (error) {
      if (error instanceof EmptyArrayError) {
        ctx.reply(locales["EMPTY_ARRAY_ERROR"]);
      } else if (error instanceof EmptyStringError) {
        ctx.reply(locales["EMPTY_STRING_ERROR"]);
      }
    }
  },
  (ctx) => {
    if (ctx.message.text === locales["YES"]) {
      ctx.session.shouldAskForFavoriteGenres = true;
      ctx.scene.next();
      ctx.reply(locales["ENTER_FAVORITE_GENRES"]);
    } else {
      ctx.scene.leave();
      ctx.scene.enter("smartMoviePick", 3);
    }
  },
  (ctx) => {
    try {
      if (ctx.session.shouldAskForFavoriteGenres) {
        ctx.session.favoriteGenres = inputParser.parseCommaSeparatedValues(
          ctx.message.text
        );
      }

      ctx.scene.next();
      ctx.reply(locales["ENTER_RATING_FROM_WHICH_TO_SEARCH"]);
    } catch (error) {
      if (error instanceof EmptyArrayError) {
        ctx.reply(locales["EMPTY_ARRAY_ERROR"]);
      } else if (error instanceof EmptyStringError) {
        ctx.reply(locales["EMPTY_STRING_ERROR"]);
      }
    }
  },
  async (ctx) => {
    ctx.session.ratingFromWhichToSearch = +ctx.message.text;

    const movies = await new BestMovieCalculator().calculate({
      movieNames: ctx.session.favoriteMovies,
      genreName: ctx.session.favoriteGenres,
      ratingFromWhichToSearch: ctx.session.ratingFromWhichToSearch,
    });

    const markup = movies.map(getVerboseMovieMarkup).join("\n\n");

    ctx.scene.leave();

    if (movies.length === 0) {
      return notFound(ctx);
    } else {
      const attachment = await new Attachment(
        bot,
        movies[0].posterUrlPreview,
        ctx.message.from_id || ctx.message.user_id
      ).getUrl();

      ctx.reply(
        `${locales["FILMS_FOUND"]}:\n${markup}`
          .split("")
          .slice(0, 4096)
          .join(""),
        attachment,
        Markup.keyboard([
          [Markup.button(locales["GET_MORE_MOVIES"])],
          [Markup.button(locales["SEARCH_RATING"])],
        ])
      );
    }
  }
);

const spellCheckScene = new Scene(
  "spellCheck",
  (ctx) => {
    ctx.scene.next();
    ctx.reply(
      locales["SPELL_CHECK_RESPONSE"].replace("{0}", ctx.session.spellCheckFix),
      null,
      Markup.keyboard([
        [Markup.button(locales["YES"])],
        [Markup.button(locales["NO"])],
      ])
    );
  },
  (ctx) => {
    ctx.session.isAskedUserAboutSpellCheckFix = true;
    const answer = ctx.message.text;

    if (answer === locales["YES"]) {
      ctx.session.userPrefersSpellCheckFix = true;
      ctx.session.query = ctx.session.spellCheckFix;
    } else {
      ctx.session.userPrefersSpellCheckFix = false;
    }

    ctx.scene.leave();
    ctx.scene.enter("start", 3);
  }
);

const yearPickScene = new Scene(
  "yearPick",
  (ctx) => {
    const maxYear = Math.max(
      ...ctx.session.movies
        .filter((movie) => !isNaN(parseInt(movie.year)))
        .map((movie) => parseInt(movie.year))
    );
    const minYear = Math.min(
      ...ctx.session.movies
        .filter((movie) => !isNaN(parseInt(movie.year)))
        .map((movie) => parseInt(movie.year))
    );

    logger.log(ctx, `min year: ${minYear}, max year: ${maxYear}`);

    const divisor = Math.floor((maxYear - minYear) / 2) + minYear;
    ctx.session.divisor = divisor;

    const markup = Markup.keyboard([
      [Markup.button(`${locales["BEFORE_YEAR"]} ${divisor}`)],
      [Markup.button(`${locales["AFTER_YEAR"]} ${divisor}`)],
    ]);

    logger.log(ctx, "offering year interval");

    ctx.scene.next();
    ctx.reply(locales["SELECT_YEAR_INTERVAL"], null, markup);
  },
  (ctx) => {
    ctx.session.yearChoice = {
      beforeDivisor: locales["BEFORE_YEAR"] === ctx.message.text,
      divisor: ctx.session.divisor,
    };

    const isBefore = ctx.message.text.includes(locales["BEFORE_YEAR"]);
    logger.log(ctx, `user wants before the year: ${isBefore ? "yes" : "no"}`);

    logger.log(
      ctx,
      `movie length before filtering: ${ctx.session.movies.length}`
    );

    const { divisor } = ctx.session;

    if (isBefore) {
      ctx.session.movies = ctx.session.movies.filter(
        (movie) => movie.year && movie.year < divisor
      );
    } else {
      ctx.session.movies = ctx.session.movies.filter(
        (movie) => movie.year && movie.year > divisor
      );
    }
    logger.log(
      ctx,
      `movie length after filtering: ${ctx.session.movies.length}`
    );
    logger.log(ctx, "returning to advanced movie search by name scene...");

    ctx.scene.leave();
    ctx.scene.enter("advancedMovieSearchByName");
  }
);

const genrePickScene = new Scene(
  "genrePick",
  (ctx) => {
    const genres = ctx.session.movies
      .map((movie) => movie.genres)
      .flat()
      .map(({ genre }) => genre)
      .filter((genre, index, array) => array.indexOf(genre) === index);

    const markup = Markup.keyboard(
      genres.map((genre) => Markup.button(genre)),
      { columns: 2 }
    );

    logger.log(ctx, "offering genres");

    ctx.scene.next();
    ctx.reply(locales["CHOOSE_GENRE"], null, markup);
  },
  (ctx) => {
    const genreChoice = ctx.message.text;

    logger.log(ctx, `user wants genre ${genreChoice}`);

    logger.log(
      ctx,
      `movie length before filtering: ${ctx.session.movies.length}`
    );

    ctx.session.movies = ctx.session.movies.filter(
      (movie) =>
        movie.genres &&
        movie.genres.some(({ genre }) => genre.includes(genreChoice))
    );

    logger.log(
      ctx,
      `movie length after filtering: ${ctx.session.movies.length}`
    );
    logger.log(ctx, "returning to advanced movie search by name scene...");

    ctx.scene.leave();
    ctx.scene.enter("advancedMovieSearchByName");
  }
);

const directorPickScene = new Scene(
  "directorPick",
  async (ctx) => {
    const directors = await Promise.all(
      ctx.session.movies.map(async (movie) => {
        const directors = await staffFetcher.getDirectorsByKinopoiskId(
          movie.filmId
        );
        movie.directors = directors;

        return directors;
      })
    );

    const directorNames = directors
      .flat()
      .map((director) => director.nameRu || director.nameEn)
      .filter((name, index, array) => array.indexOf(name) === index)
      .slice(0, 10);

    const markup = Markup.keyboard(
      directorNames.map((directorName) => Markup.button(directorName), {
        columns: 2,
      })
    );

    logger.log(ctx, "offering directors");

    ctx.scene.next();
    ctx.reply(locales["SELECT_DIRECTOR"], null, markup);
  },
  (ctx) => {
    const directorName = ctx.message.text;

    logger.log(ctx, `user wants director: ${directorName}`);

    logger.log(
      ctx,
      `movie length before filtering: ${ctx.session.movies.length}`
    );

    ctx.session.movies = ctx.session.movies.filter(
      (movie) =>
        movie.directors &&
        movie.directors.some(
          (director) =>
            director.nameRu === directorName || director.nameEn === directorName
        )
    );

    logger.log(
      ctx,
      `movie length after filtering: ${ctx.session.movies.length}`
    );
    logger.log(ctx, "returning to advanced movie search by name scene...");

    ctx.scene.leave();
    ctx.scene.enter("advancedMovieSearchByName");
  }
);

const advancedMovieSearchByNameScene = new Scene(
  "advancedMovieSearchByName",
  async (ctx) => {
    const userId = ctx.message.from_id || ctx.message.user_id;

    logger.log(ctx, "advanced movie search enter, step 0");
    const isFirstTime = !ctx.session.tactics;

    logger.log(ctx, `first time: ${isFirstTime ? "yes" : "no"}`);

    if (typeof ctx.session.tactics === "undefined") {
      logger.log(ctx, "initialize tactics because they do not exist");
      ctx.session.tactics = [
        locales["RELEASE_YEAR"],
        locales["GENRE"],
        locales["DIRECTOR"],
      ];
    }

    if (ctx.session.movies.length === 1) {
      logger.log(ctx, "found exactly one movie");

      const movie = await movieFetcher.getMovieByKinopoiskId(
        ctx.session.movies.pop().filmId
      );

      let movieMarkup = getVerboseMovieMarkup(movie);

      const movieTitle = movie.nameRu || movie.nameEn;

      try {
        const podcast = await podcastFetcher.fetchByKeywordOrThrow(movieTitle);
        movieMarkup += `\n\n${locales["PODCAST_FOUND"]}${podcast.id}`;
      } catch (error) {
        if (error instanceof PodcastNotFoundError) {
          logger.log(ctx, `cannot find podcast for ${movieTitle}: ${error}`);
        } else {
          logger.log(ctx, `error during podcast fetch: ${error}`);
        }
      }

      const attachment = await new Attachment(
        bot,
        movie.posterUrlPreview,
        userId
      ).getUrl();

      ctx.reply(
        `${locales["FOUND_ABSTRACT"]}\n${movieMarkup}`,
        attachment,
        Markup.keyboard([
          [Markup.button(locales["GET_MORE_MOVIES"])],
          [Markup.button(locales["SEARCH_RATING"])],
        ])
      );
      return ctx.scene.leave();
    }

    if (isFirstTime) {
      logger.log(ctx, "first time, will show all tactics");
      ctx.reply(
        locales["INDEFINITE_MOVIE_COUNT"].replace(
          "{0}",
          ctx.session.movies.length
        ),
        null,
        Markup.keyboard(
          ctx.session.tactics.map((tactic) => [Markup.button(tactic)])
        )
      );
    } else {
      logger.log(ctx, "not the first time, will show a few tactics");
      const tactic = ctx.message.text;

      ctx.session.tactics = ctx.session.tactics.filter(
        (sessionTactic) => sessionTactic !== tactic
      );
      if (tactic === locales["RELEASE_YEAR"]) {
        logger.log(ctx, "will use release year to find a movie by name");
        logger.log(ctx, "entering year pick scene...");

        ctx.scene.leave();
        return ctx.scene.enter("yearPick");
      } else if (tactic === locales["GENRE"]) {
        logger.log(ctx, "will use genre to find a movie by name");
        logger.log(ctx, "entering genre pick scene...");

        ctx.scene.leave();
        return ctx.scene.enter("genrePick");
      } else if (tactic === locales["DIRECTOR"]) {
        logger.log(ctx, "will use director to find a movie by name");
        logger.log(ctx, "entering director pick scene...");

        ctx.scene.leave();
        return ctx.scene.enter("directorPick");
      }

      logger.log(
        ctx,
        "current tactics left: " + ctx.session.tactics.length === 0
          ? "none"
          : ctx.session.tactics.join(", ")
      );

      if (ctx.session.tactics.length === 0) {
        logger.log(
          ctx,
          "no more tactics, leaving the scene and showing movies..."
        );

        const ratingFulfilledMovies = await Promise.all(
          ctx.session.movies.slice(0, 3).map(async (movie) => {
            return await movieFetcher.getMovieByKinopoiskId(movie.filmId);
          })
        );

        const movieMarkup = ratingFulfilledMovies
          .map(getShortMovieMarkup)
          .map((markup, index) => `${index + 1}. ${markup}`)
          .join("\n");

        const attachment = await new Attachment(
          bot,
          ctx.session.movies[0].posterUrlPreview,
          userId
        ).getUrl();

        ctx.reply(
          `${locales["STILL_MANY_MOVIES"]}\n${movieMarkup}`,
          attachment,
          Markup.keyboard([
            [Markup.button(locales["GET_MORE_MOVIES"])],
            [Markup.button(locales["SEARCH_RATING"])],
          ])
        );

        return ctx.scene.leave();
      }

      const buttons = ctx.session.tactics.map((tactic) => [
        Markup.button(tactic),
      ]);

      ctx.reply(
        locales["STILL_INDEFINITE"].replace("{0}", ctx.session.movies.length),
        null,
        Markup.keyboard(buttons)
      );
    }
  }
);

const getRatingScene = new Scene(
  "getRating",
  (ctx) => {
    logger.log(ctx, "entering get rating scene...");
    ctx.scene.next();
    ctx.reply(locales["ENTER_INPUT_RESPONSE"]);
  },
  async (ctx) => {
    ctx.session.query = ctx.message.text;
    logger.log(
      ctx,
      `user wants to get rating of the movie ${ctx.session.query}`
    );
    ctx.scene.leave();

    const movies = await movieFetcher.getByKeyword(ctx.session.query);

    if (movies.length === 0) {
      logger.log(ctx, "the movie by the given name is not found");
      return notFound(ctx);
    }

    const movie = movies[0];

    const movieMarkup = getVerboseMovieMarkup(
      await movieFetcher.getMovieByKinopoiskId(movie.filmId)
    );

    const userId = ctx.message.from_id || ctx.message.user_id;

    const attachment = await new Attachment(
      bot,
      movies[0].posterUrlPreview,
      userId
    ).getUrl();

    logger.log(ctx, "found a movie, showing its rating to the end user...");

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
    logger.log(ctx, "entering pick scene...");
    ctx.scene.next();
    logger.log(ctx, "offering genres...");
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
    logger.log(ctx, `user prefers genre ${ctx.session.genre}`);

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

    logger.log(ctx, `user prefers type ${ctx.session.type}`);

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

    logger.log(ctx, `user prefers rating ${ctx.session.rating}`);

    ctx.scene.leave();
    notifyStartSearching(ctx);

    const genreId = genres.filter(({ genre }) => ctx.session.genre === genre)[0]
      .id;
    const movieType = movieTypes.filter(
      ({ label }) => ctx.session.type === label
    )[0].value;

    const rating = ctx.session.rating;

    let movies = await movieFetcher.getByFilters({
      genreId,
      movieType,
      ratingFrom: rating,
      ratingTo: "10",
    });

    movies = movies.filter(
      (movie) =>
        movie.ratingKinopoisk && movie.ratingKinopoisk > ctx.session.rating
    );

    if (movies.length === 0) {
      logger.log(
        ctx,
        "movies by the given genre, type and rating were not found"
      );
      return notFound(ctx);
    }

    const movie = await movieFetcher.getMovieByKinopoiskId(
      movies[Math.floor(Math.random() * movies.length)].kinopoiskId
    );

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

    logger.log(
      ctx,
      "found a movie by the given genre, type and rating, showing..."
    );

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
    logger.log(ctx, "enter start scene");
    delete ctx.session.tactics;
    delete ctx.session.favoriteGenres;
    delete ctx.session.favoriteMovies;
    delete ctx.session.ratingFromWhichToSearch;

    ctx.scene.next();
    ctx.reply(
      `${locales["START_RESPONSE"]}`,
      null,
      Markup.keyboard([
        [Markup.button(locales["ACTION_FIND_MOVIE"])],
        [Markup.button(locales["ACTION_PICK_MOVIE"])],
        [Markup.button(locales["SMART_MOVIE_PICK"])],
        [Markup.button(locales["SEARCH_RATING"])],
      ]).oneTime()
    );
  },
  (ctx) => {
    ctx.session.isAskedUserAboutSpellCheckFix = false;
    ctx.session.spellCheckFix = "";
    ctx.session.userPrefersSpellCheckFix = false;

    logger.log(ctx, `start scene: step 1: ${ctx.message.text}`);
    if (ctx.message.text === locales["ACTION_PICK_MOVIE"]) {
      logger.log(ctx, "will pick a movie");
      ctx.scene.leave();
      return ctx.scene.enter("pick");
    }

    if (ctx.message.text === locales["SMART_MOVIE_PICK"]) {
      logger.log(ctx, "will pick movies for user using smart pick");
      ctx.scene.leave();
      return ctx.scene.enter("smartMoviePick");
    }

    if (ctx.message.text === locales["SEARCH_RATING"]) {
      logger.log(ctx, "will search rating");
      ctx.scene.leave();
      return ctx.scene.enter("getRating");
    }

    ctx.session.action = locales["ACTION_FIND_MOVIE"];
    logger.log(ctx, "will find a movie");

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
    logger.log(ctx, `movie search type: ${ctx.message.text}`);

    ctx.scene.next();

    if (ctx.session.movieSearchType === locales["RANDOM_MOVIE"]) {
      logger.log(ctx, "will search a random movie");
      notifyStartSearching(ctx);
      const movie = await movieFetcher.getRandomMovie();

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

      logger.log(ctx, "notifying the user that movie is found...");

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

    if (!ctx.session.isAskedUserAboutSpellCheckFix) {
      ctx.session.query = ctx.message.text;
    }

    logger.log(ctx, `will find movie because query is ${ctx.session.query}`);

    ctx.scene.leave();

    if (ctx.session.action === locales["ACTION_FIND_MOVIE"]) {
      logger.log(ctx, "will find a movie");
      if (ctx.session.movieSearchType === locales["FIND_MOVIE_BY_NAME"]) {
        logger.log(ctx, "will find a movie by name");

        const query = ctx.session.query;

        const validationResults = spellChecker.getValidationResults(query);

        if (
          !ctx.session.isAskedUserAboutSpellCheckFix &&
          !validationResults.isValid
        ) {
          ctx.session.spellCheckFix = validationResults.fix;

          logger.log(
            ctx,
            `query "${query}" could be fixed to "${validationResults.fix}"`
          );
          logger.log(
            ctx,
            "asking user if he wants to use the changed version or does not..."
          );

          ctx.scene.leave();
          return ctx.scene.enter("spellCheck");
        }

        if (ctx.session.userPrefersSpellCheckFix) {
          ctx.session.query = ctx.session.spellCheckFix;
          logger.log(
            ctx,
            `spell check fix applied: ${ctx.session.spellCheckFix}`
          );
        }

        const movies = await movieFetcher.getByKeyword(ctx.session.query);

        if (movies.length === 0) {
          logger.log(
            ctx,
            `movies by the given name ${ctx.session.query} were not found`
          );
          return notFound(ctx);
        } else if (movies.length === 1) {
          logger.log(ctx, "found a single movie by name");
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
              `${locales["FOUND_ABSTRACT"]}:\n${movieMarkup}`,
              attachment,
              Markup.keyboard([
                [Markup.button(locales["GET_MORE_MOVIES"])],
                [Markup.button(locales["SEARCH_RATING"])],
              ])
            );
          }
        } else {
          logger.log(ctx, `found many movies by name (${movies.length})`);
          ctx.session.movies = movies;
          ctx.scene.leave();
          return ctx.scene.enter("advancedMovieSearchByName");
        }
      } else if (ctx.session.movieSearchType === locales["FIND_MOVIE_BY_ID"]) {
        logger.log(ctx, "will find the movie by its id");
        let movie;

        try {
          movie = await movieFetcher.getMovieByKinopoiskId(ctx.session.query);
        } catch (error) {
          logger.log(
            ctx,
            `can't find the movie by id, error occurred: ${error}`
          );
          return notFound(ctx);
        }

        if (!movie || movie.message) {
          logger.log(
            ctx,
            "no movie or its message, giving 404 error to the end user"
          );
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

        logger.log(ctx, "found the movie by id, showing to the end user");

        return ctx.reply(
          `${locales["FOUND_ABSTRACT"]}\n${movieMarkup}`,
          attachment,
          Markup.keyboard([
            [Markup.button(locales["GET_MORE_MOVIES"])],
            [Markup.button(locales["SEARCH_RATING"])],
          ])
        );
      } else if (ctx.session.movieSearchType === locales["SEARCH_RATING"]) {
        logger.log(ctx, "will find the movie by its rating");
        ctx.scene.leave();
        ctx.scene.enter("getRating", 1);
      } else {
        logger.log(
          ctx,
          `unsupported movie search type: ${ctx.session.movieSearchType}`
        );
        ctx.reply(locales["UNSUPPORTED_ACTION"]);
      }
    } else {
      logger.log(ctx, `unsupported action: ${ctx.session.action}`);
      ctx.reply(locales["UNSUPPORTED_ACTION"]);
    }
  }
);

const session = new Session();
const stage = new Stage(
  startScene,
  pickScene,
  getRatingScene,
  advancedMovieSearchByNameScene,
  yearPickScene,
  genrePickScene,
  directorPickScene,
  spellCheckScene,
  smartMoviePickScene
);

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
  logger.genericLog(`start command registered: ${command}`);
  bot.command(command, (ctx) => {
    ctx.scene.enter("start");
  });
});

[locales["SEARCH_RATING"], locales["SEARCH_RATING"].toLowerCase()].forEach(
  (command) => {
    logger.genericLog(`search rating command registered: ${command}`);
    bot.command(command, (ctx) => {
      ctx.scene.enter("getRating");
    });
  }
);

[
  locales["SMART_MOVIE_PICK"],
  locales["SMART_MOVIE_PICK"].toLowerCase(),
].forEach((command) => {
  logger.genericLog(`smart movie pick command registered: ${command}`);
  bot.command(command, (ctx) => {
    ctx.scene.enter("smartMoviePick");
  });
});

function notifyStartSearching(ctx) {
  logger.log(ctx, "started searching");
  ctx.reply(`${locales["STARTED_SEARCH"]}`);
}

function getShortMovieMarkup(movie) {
  let maybeDescription = "";

  let maybeFilmId = "";

  if (movie.filmId) {
    maybeFilmId = movie.filmId;
  }

  if (movie.description) {
    maybeDescription = movie.description;
  }

  const ratingImdb = `${locales["IMDB"]}: ${
    movie.ratingImdb ? `${movie.ratingImdb}/10` : locales["NO_RATING"]
  }`;
  const ratingKinopoisk = `${locales["KINOPOISK"]}: ${
    movie.ratingKinopoisk ? `${movie.ratingKinopoisk}/10` : locales["NO_RATING"]
  }`;

  const tab = "⠀";

  return `${movie.nameRu || movie.nameEn || movie.nameOriginal}\n${
    maybeDescription ? `${locales["DESCRIPTION"]}: ${maybeDescription}\n` : ""
  }${tab}${ratingKinopoisk}\n${tab}${ratingImdb}${
    maybeFilmId
      ? `\n${locales["MORE_INFO"]}: ${locales["MOVIE_URL_PLACEHOLDER"].replace(
          "{0}",
          maybeFilmId
        )}`
      : ""
  }`;
}

function getVerboseMovieMarkup(movie) {
  const rows = [];

  rows.push(
    `${locales["FILM_INFO_TITLE"]} ${
      movie.nameRu || movie.nameEn || movie.nameOriginal
    }`
  );

  if (movie.description) {
    rows.push(`${locales["DESCRIPTION"]}: ${movie.description}`);
  }

  rows.push(
    movie.ratingImdb
      ? `${locales["IMDB"]}: ${movie.ratingImdb}/10`
      : `${locales["IMDB"]}: ${locales["NO_RATING"]}`
  );
  rows.push(
    movie.ratingKinopoisk
      ? `${locales["KINOPOISK"]}: ${movie.ratingKinopoisk}/10`
      : `${locales["KINOPOISK"]}: ${locales["NO_RATING"]}`
  );

  if (movie.year) {
    rows.push(`${locales["RELEASED_IN"]} ${movie.year}`);
  }

  if (movie.genres) {
    rows.push(
      `${locales["GENRES"]}: ${movie.genres
        .map(({ genre }) => genre)
        .join(", ")}`
    );
  }

  rows.push(`${locales["MORE_INFO"]}: ${movie.webUrl}`);

  const movieMarkup = rows.join("\n");

  return movieMarkup;
}

function notFound(ctx) {
  logger.log(ctx, "not found");
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
