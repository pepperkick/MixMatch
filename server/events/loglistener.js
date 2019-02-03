const log = require('debug')('app:events:loglistener');

module.exports = app => {    
    log("Started");

    const Queue = app.connection.model("Queue");
    const Player = app.connection.model("Player");
    const LogListener = app.loglistener;

    LogListener.on("onRCONCommand", log);
    LogListener.on("onServerCvarChange", log);
};