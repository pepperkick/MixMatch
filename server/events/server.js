const log = require('debug')('app:events:server');

module.exports = app => {    
    const Server = app.connection.model("Server");
    const Discord = app.discord;

    Server.on("discord_send_message", async (data) => {
        const { doc, message} = data;
        
        await Discord.sendToChannel(doc.channel, message);
    });
}