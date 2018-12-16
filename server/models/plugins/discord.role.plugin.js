module.exports = async (schema, options) => {
    const app = options.app;
    const cache = {};

    schema.methods.getDiscordRole = function () {
        let id = this.role || this[options.id];

        if (!app.discord) throw new Error("Discord service is not attached to app");
        if (!id) throw new Error("Discord id is not present");

        if (cache[id]) return cache[id];

        return app.discord.bot.guilds.get(app.config.discord.guild).roles.get(id);
    }
}