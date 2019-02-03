const discord = require("./discord");
const loglistener = require("./loglistener");

module.exports = app => {
    discord(app);
    loglistener(app);
}