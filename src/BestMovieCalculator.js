require("dotenv").config();

const { Logger } = require("./loggers/logger");
const { MovieFetcher } = require("./MovieFetcher");

class BestMovieCalculator {
  /**
   *
   * @param {{movieNames: string[], genreNames: string[] | undefined, ratingFromWhichToSearch: number}} movieNames
   * @return {Promise<any[]>} movies
   */
  calculate = async ({ movieNames, genreNames, ratingFromWhichToStart }) => {
    const logger = new Logger();

    const movieSpecimenName = movieNames
      .sort(() => (Math.random() > 0.5 ? 1 : -1))
      .pop();

    const fetcher = new MovieFetcher({
      baseUrl: process.env["BASE_URL"],
      apiKey: process.env["API_KEY"],
    });

    const movieSpecimens = (await fetcher.getByKeyword(movieSpecimenName)).sort(
      (m1, m2) => m2.ratingVoteCount - m1.ratingVoteCount
    );

    const movie = movieSpecimens[0];

    const previewSimilarMovies = await fetcher.getSimilarMovies(movie.filmId);

    let similarMovies = await Promise.all(
      previewSimilarMovies.slice(0, 10).map(async (movie) => {
        await new Promise((r) =>
          setTimeout(r, Math.floor(Math.random() * (2000 - 1000 + 1) + 1000))
        );
        return fetcher.getMovieByKinopoiskId(movie.filmId);
      })
    );

    if (genreNames) {
      logger.genericLog("will use genres that user entered: " + genreNames);

      const combinations = genreNames.map((genreName) => {
        return {
          genreName,
          movies: similarMovies.filter(
            (movie) =>
              movie.genres &&
              movie.genres.includes(genreName.toLowerCase()) &&
              (movie.ratingKinopoisk >= ratingFromWhichToStart ||
                movie.ratingImdb >= ratingFromWhichToStart)
          ),
        };
      });

      if (
        combinations.every((combination) => combination.movies.length === 0)
      ) {
        logger.genericLog(
          "can't find movies using genre, returning all movies instead"
        );
      } else {
        similarMovies = combinations
          .map((combination) => combination.movies)
          .sort((c1, c2) => c1.length - c2.length)
          .pop();
      }
    }

    logger.genericLog(`found ${similarMovies.length} best movies for the user`);

    return similarMovies.slice(0, 5);
  };
}

module.exports = {
  BestMovieCalculator,
};
