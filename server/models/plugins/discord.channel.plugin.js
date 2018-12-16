module.exports = async (schema, options) => {
    const app = options.app;

    schema.methods.getDiscordChannel = function () {
        let id = this.channel || this[options.id];

        if (!app.discord) throw new Error("Discord service is not attached to app");
        if (!id) throw new Error("Discord id is not present");

        return app.discord.bot.guilds.get(app.config.discord.guild).channels.get(id);
    }
}