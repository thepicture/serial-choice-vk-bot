const { Logger } = require("./loggers/logger");

require("dotenv").config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

class PodcastNotFoundError extends Error {}

class PodcastFetcher {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   *
   * @param {string} keyword
   */
  fetchByKeywordOrThrow = async (keyword) => {
    const logger = new Logger();

    try {
      const params = {
        access_token: process.env["ACCESS_TOKEN"],
        domain: "serialchoice",
        query: keyword.toLowerCase(),
        owners_only: 1,
        count: 1,
        v: "5.131",
      };

      const response = await fetch(
        `https://api.vk.com/method/wall.search?${new URLSearchParams(params)}`,
        {
          method: "POST",
        }
      );

      logger.genericLog(
        `response status: ${response.status}, response text: ${response.statusText}`
      );

      const json = await response.json();

      const {
        response: { items },
      } = json;

      if (items.count === 0) {
        throw new PodcastNotFoundError();
      }

      return items.pop();
    } catch (error) {
      throw new PodcastNotFoundError(error);
    }
  };
}

module.exports = {
  PodcastFetcher,
  PodcastNotFoundError,
};
