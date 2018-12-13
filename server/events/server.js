const log = require('debug')('app:events:server');

module.exports = app => {    
    const Server = app.connection.model("Server");
    const Discord = app.discord;

    Server.on("discord_send_message", async (data) => {
        const { doc, message} = data;
        
        await Discord.sendToChannel(doc.channel, message);
    });

    Server.on("update", async server => {
        if (server.status = Server.status.FREE) {
            const format = app.config.formats[server.format];

            if (server.players.length >= format.size * 2) {
                log(`Enough players have joined ${server.name}, switching status to SETUP`);

                server.status = Server.status.SETUP;

                await server.save();
            }
        }
    });
}