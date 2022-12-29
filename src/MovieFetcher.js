const { Logger } = require("./loggers/logger");
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
    const response = await fetch(`${this.baseUrl}/${kinopoiskId}`, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    return await response.json();
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
        logger.genericLog(
          "invalid random movie id: " + movieId + ", continuing..."
        );
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      return movie;
    }
  };
}

module.exports = {
  MovieFetcher,
};
