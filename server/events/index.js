const discord = require("./discord");
const server = require("./server");
const player = require("./player");

module.exports = app => {
    discord(app);
    server(app);
    player(app);
}