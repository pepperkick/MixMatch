module.exports = async (schema, options) => {
    const app = options.app;

    schema.virtual("discordChannel").get(function () {
        return this.getDiscordChannel();
    });

    schema.methods.getDiscordChannel = function () {
        let id = this.channel || this[options.id];

        if (!app.discord) throw new Error("Discord service is not attached to app");
        if (!id) throw new Error("Discord id is not present");

        return app.discord.bot.guilds.get(app.config.discord.guild).channels.get(id);
    }    
    
    schema.methods.getDiscordTextChannel = function () {
        const category = this.discordChannel;
        const channels = category.children.array();
        
        for (const id in channels) {
            if (channels[id].name === "general" && channels[id].type === "text")
                return category.children.get(channels[id].id);
        }

        throw new Error(`Unable to find text channel for ${this.name}`);
    }

    schema.methods.getDiscordVoiceChannel = function () {
        const category = this.discordChannel;
        const channels = category.children.array();
        
        for (const id in channels) {
            if (channels[id].name === "General" && channels[id].type === "voice")
                return category.children.get(channels[id].id);
        }

        throw new Error(`Unable to find voice channel for ${this.name}`);
    }

    schema.methods.getDiscordTeamAChannel = function () {
        const category = this.discordChannel;
        const channels = category.children.array();
        
        for (const id in channels) {
            if (channels[id].name === app.config.teams.A.name && channels[id].type === "voice")
                return category.children.get(channels[id].id);
        }

        throw new Error(`Unable to find team A voice channel for ${this.name}`);
    }

    schema.methods.getDiscordTeamBChannel = function () {
        const category = this.discordChannel;
        const channels = category.children.array();
        
        for (const id in channels) {
            if (channels[id].name === app.config.teams.B.name && channels[id].type === "voice")
                return category.children.get(channels[id].id);
        }

        throw new Error(`Unable to find team B voice channel for ${this.name}`);
    }
}