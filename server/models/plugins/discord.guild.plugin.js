module.exports = async (schema, options) => {
    const app = options.app;

    schema.methods.getDiscordGuild = function () {
        if (!app.discord) throw new Error("Discord service is not attached to app");
    
        return app.discord.bot.guilds.get(app.config.discord.guild);
    }
}