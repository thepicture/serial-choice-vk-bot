const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

class MovieFetcher {
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
    const response = await fetch(`${this.baseUrl}/top`, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    const json = await response.json();

    const { films: movies } = json;

    movies.sort(() => (Math.random() > 0.5 ? 1 : -1));

    const movie = movies.pop();

    return movie;
  };
}

module.exports = {
  MovieFetcher,
};
