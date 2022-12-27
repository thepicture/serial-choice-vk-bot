class Logger {
  log = (ctx, message) => {
    const fromId = ctx.message["from_id"] || ctx.message["peer_id"];

    console.log(`[${new Date().toISOString()}] [${fromId}] ${message}`);
  };
}

module.exports = {
  Logger,
};
