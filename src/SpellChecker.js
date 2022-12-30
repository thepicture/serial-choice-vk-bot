const { closest } = require("fastest-levenshtein");

const WORDS = require("./words.json");

class SpellChecker {
  /**
   *
   * @param {string} query
   * @returns {{isValid: true}| {isValid: false, fix: string}}
   */
  getValidationResults = (query) => {
    const builder = [];

    const sanitizedQuery = this._sanitize(query);
    const words = sanitizedQuery.split(" ");

    for (const userWord of words) {
      builder.push(closest(userWord, WORDS));
    }

    const fix = builder.join(" ");

    const isValid = fix === sanitizedQuery.toLowerCase();

    const validationResults = {
      isValid,
    };

    if (!isValid) {
      validationResults.fix = fix;
    }

    return validationResults;
  };

  _sanitize = (query) => query.toLowerCase().replace(/[^a-zа-я]/g, " ");
}

module.exports = {
  SpellChecker,
};
