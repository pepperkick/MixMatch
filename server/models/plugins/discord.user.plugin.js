module.exports = async (schema, options) => {
    const app = options.app;

    schema.virtual("discordUser").get(function () {
        return this.getDiscordUser();
    });
    
    schema.virtual("discordMember").get(function () {
        return this.getDiscordMember();
    });

    schema.methods.getDiscordUser = function () {
        let id = this.discord || this[options.id];

        if (!app.discord) throw new Error("Discord service is not attached to app");
        if (!id) throw new Error("Discord id is not present");

        return app.discord.bot.users.get(id);
    }

    schema.methods.getDiscordMember = function () {
        let id = this.discord || this[options.id];

        if (!app.discord) throw new Error("Discord service is not attached to app");
        if (!id) throw new Error("Discord id is not present");

        return app.discord.bot.guilds.get(app.config.discord.guild).members.get(id);
    }
}