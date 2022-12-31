const { Logger } = require("./loggers/logger.js");
const { Randomizer } = require("./Randomizer");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

class MovieFetcher {
  static MIN_MOVIE_ID = 298;
  static MAX_MOVIE_ID = 1405508;

  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  getByKeyword = async (keyword) => {
    const deprecatedBaseUrl = this.baseUrl.replace("2.2", "2.1");
    const url = `${deprecatedBaseUrl}/search-by-keyword?keyword=${encodeURIComponent(
      keyword
    )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    const json = await response.json();

    return json.films;
  };

  getByFilters = async ({
    genreId = "",
    movieType = "",
    ratingFrom = "1",
    ratingTo = "10",
  }) => {
    let urlBuilder = this.baseUrl;

    let isFirstQuery = true;

    if (genreId) {
      urlBuilder += `${isFirstQuery ? "?" : "&"}genres=${genreId}`;
      isFirstQuery = false;
    }

    if (movieType) {
      urlBuilder += `${isFirstQuery ? "?" : "&"}type=${movieType}`;
      isFirstQuery = false;
    }

    if (ratingFrom) {
      urlBuilder += `${isFirstQuery ? "?" : "&"}ratingFrom=${ratingFrom}`;
      isFirstQuery = false;
    }

    if (ratingTo) {
      urlBuilder += `${isFirstQuery ? "?" : "&"}ratingTo=${ratingTo}`;
      isFirstQuery = false;
    }

    const response = await fetch(urlBuilder, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    const json = await response.json();

    const { items } = json;

    return items;
  };

  getMovieByKinopoiskId = async (kinopoiskId) => {
    const logger = new Logger();

    const response = await fetch(`${this.baseUrl}/${kinopoiskId}`, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    try {
      return await response.json();
    } catch {
      logger.genericLog(
        `error during getting a movie by kinopoisk id. response head: ${response.status} ${response.statusText}`
      );
    }
  };

  getRandomMovie = async () => {
    const logger = new Logger();
    for (let i = 0; i < 16; i++) {
      const movieId = Randomizer.randint(
        MovieFetcher.MIN_MOVIE_ID,
        MovieFetcher.MAX_MOVIE_ID
      );

      const response = await fetch(`${this.baseUrl}/${movieId}`, {
        method: "GET",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
      });

      let movie;

      try {
        movie = await response.json();
      } catch {
        logger.genericLog(`invalid random movie id: ${movieId}, continuing...`);
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      logger.genericLog(`${movieId} does exist`);

      return movie;
    }
  };

  getSimilarMovies = async (kinopoiskId) => {
    const logger = new Logger();

    const response = await fetch(`${this.baseUrl}/${kinopoiskId}/similars`, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();

    let json;

    try {
      json = JSON.parse(text);
    } catch {
      logger.genericLog(`error occurred during json parse: ${text}`);
    }

    const { total, items } = json;

    logger.genericLog(`got similar movies. count: ${total}`);

    return items.slice(0, 10);
  };
}

module.exports = {
  MovieFetcher,
};
