const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const ProfessionKeys = {
  DIRECTOR: "DIRECTOR",
};

class StaffFetcher {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  getStaffByKinopoiskId = async (kinopoiskId) => {
    const response = await fetch(`${this.baseUrl}/?filmId=${kinopoiskId}`, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    return await response.json();
  };

  getDirectorsByKinopoiskId = async (kinopoiskId) => {
    return await this.getStaffByKinopoiskId(kinopoiskId).then((staff) =>
      staff.filter((person) => person.professionKey === ProfessionKeys.DIRECTOR)
    );
  };
}

module.exports = {
  StaffFetcher,
};
