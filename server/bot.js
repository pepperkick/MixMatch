module.exports = (app) => {
    app.discord.on("newMember", async member => {
        try {
            const channel = await member.user.createDM();  
            const message = {
                text: `Thank you for joining our discord, please visit the following link to register with us so you can enjoy the matches.\nhttp://${app.config.host}:${app.config.port}/auth/discord`
            }

            await app.discord.sendToChannel(channel, message);
        } catch (error) {
            log(error);
        }
    });
};