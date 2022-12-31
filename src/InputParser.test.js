const {
  InputParser,
  EmptyArrayError,
  EmptyStringError,
} = require("./InputParser.js");

describe("parse comma separated values", () => {
  const parser = new InputParser();

  it("should give [a,b,c] for a,b,c input", () => {
    const expected = ["a", "b", "c"];
    const input = "a,b,c";

    const actual = parser.parseCommaSeparatedValues(input);

    expect(expected).toEqual(actual);
  });

  it("should give [a,b,c] for a, b, c input", () => {
    const expected = ["a", "b", "c"];
    const input = "a, b, c";

    const actual = parser.parseCommaSeparatedValues(input);

    expect(expected).toEqual(actual);
  });

  it("should give [A,b,c] for A, b, c input", () => {
    const expected = ["A", "b", "c"];
    const input = "A, b, c";

    const actual = parser.parseCommaSeparatedValues(input);

    expect(expected).toEqual(actual);
  });

  it("should throw EmptyStringError for , input", () => {
    const expected = EmptyStringError;
    const input = ",";

    const actual = () => parser.parseCommaSeparatedValues(input);

    expect(actual).toThrow(expected);
  });

  it("should throw EmptyArrayError for empty input", () => {
    const expected = EmptyArrayError;
    const input = "";

    const actual = () => parser.parseCommaSeparatedValues(input);

    expect(actual).toThrow(expected);
  });

  it("should not throw EmptyArrayError for input consisting of one value", () => {
    const expected = ["abc"];
    const input = "abc";

    const actual = parser.parseCommaSeparatedValues(input);

    expect(actual).toEqual(expected);
  });
});
