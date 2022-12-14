const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const FormData = require("form-data");

class Attachment {
  constructor(bot, url, peerId) {
    this.bot = bot;
    this.url = url;
    this.peerId = peerId;
  }

  async getUrl() {
    const { upload_url } = await this.bot.execute(
      "photos.getMessagesUploadServer",
      {
        peerId: this.peerId,
      }
    );

    const form = new FormData();
    const body = (await fetch(this.url)).body;
    form.append("photo", body, "file.jpg");

    const response = await fetch(upload_url, {
      method: "POST",
      headers: form.getHeaders(),
      body: form,
    });

    const [{ owner_id, id }] = await this.bot.execute(
      "photos.saveMessagesPhoto",
      {
        ...(await response.json()),
      }
    );

    return "photo" + owner_id + "_" + id;
  }
}

module.exports = {
  Attachment,
};
