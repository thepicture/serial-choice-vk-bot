const { SpellChecker } = require("./SpellChecker");

describe("get validation results", () => {
  const checker = new SpellChecker();

  it("gives correct output for incorrect input", () => {
    const expected = {
      isValid: false,
      fix: "человек паук",
    };

    const actual = checker.getValidationResults("чиловек поук");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for incorrect input", () => {
    const expected = {
      isValid: false,
      fix: "человек паук",
    };

    const actual = checker.getValidationResults("чиловек-поук");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for correct input with a hyphen", () => {
    const expected = {
      isValid: true,
    };

    const actual = checker.getValidationResults("человек-паук");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for correct input with a space", () => {
    const expected = {
      isValid: true,
    };

    const actual = checker.getValidationResults("человек паук");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for correct input with a space and random casing", () => {
    const expected = {
      isValid: true,
    };

    const actual = checker.getValidationResults("ЧЕЛовеК паУк");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for incorrect input with additional letter", () => {
    const expected = {
      isValid: false,
      fix: "человек паук",
    };

    const actual = checker.getValidationResults("человек паукч");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for incorrect input with non-existing letter", () => {
    const expected = {
      isValid: false,
      fix: "человек паук",
    };

    const actual = checker.getValidationResults("человек пау");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for correct input with consecutive hyphens", () => {
    const expected = {
      isValid: true,
    };

    const actual = checker.getValidationResults("человек----паук");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for incorrect input with consecutive hyphens", () => {
    const expected = {
      isValid: false,
      fix: "человек паук",
    };

    const actual = checker.getValidationResults("чиловек----поук");

    expect(expected).toMatchObject(actual);
  });

  it("gives correct output for correct input with words of length less than 3", () => {
    const expected = {
      isValid: true,
    };

    const actual = checker.getValidationResults("человек а б в паук");

    expect(expected).toMatchObject(actual);
  });

  it("should not check english names", () => {
    const expected = {
      isValid: false,
      fix: 'человек spider паук'
    };

    const actual = checker.getValidationResults("человек spider поук");

    expect(expected).toMatchObject(actual);
  });
});
