class EmptyArrayError extends Error {}
class EmptyStringError extends Error {}

class InputParser {
  /**
   *
   * @param {string} commaSeparatedValues
   */
  parseCommaSeparatedValues = (commaSeparatedValues) => {
    const valueArray = commaSeparatedValues
      .split(",")
      .map((value) => value.trim());

    if (valueArray.length === 1 && valueArray[0].trim() === "") {
      throw new EmptyArrayError();
    }

    if (valueArray.some((name) => !name)) {
      throw new EmptyStringError();
    }

    return valueArray;
  };
}

module.exports = {
  InputParser,
  EmptyArrayError,
  EmptyStringError,
};
