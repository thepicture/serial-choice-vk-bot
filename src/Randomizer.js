class Randomizer {
  static randint = (min, max) =>
    Math.floor(Math.random() * (max - min + 1) + min);
}

module.exports = {
  Randomizer,
};
