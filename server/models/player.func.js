const log = require('debug')('app:models:player');

module.exports = (schema) => {    
    const statuses = Object.freeze({
        FREE: "FREE",
        JOINED: "JOINED"
    });

    const discord_users = {};

    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.FREE
        }
    });

    schema.virtual('discord_user').set(function(_user) {
        discord_users[this.id] = _user;
    });

    schema.virtual('discord_user').get(function() {
        if (!discord_users[this.id]) throw new Error(`Discord user for player ${this.discord} does not exist.`)

        return discord_users[this.id];
    });
    
    schema.statics.status = statuses;

    schema.statics.findByDiscord = async function (user) {
        if (typeof user === 'string') {
            return await this.findOne({ discord: user });
        }

        return await this.findOne({ discord: user.id });
    }

    schema.statics.findBySteam = async function (id) {
        return await this.findOne({ steam: id });
    }

    schema.statics.checkOrGet = async function (player) {
        if (typeof user === 'string') {
            return this.findById(player);
        }

        if (!player.status) {
            return this.findById(player);            
        }

        return player;
    }

    schema.methods.leaveServer = async function () {
        await this.changeDiscordNickname('', `Joined ${this.server.name}`);

        this.status = statuses.FREE;
        this.server = null;

        await this.save();
    }

    schema.methods.joinServer = async function (server) {
        this.status = statuses.JOINED;
        this.server = server.id;

        const nickname = this.discord_user.user.username;

        await this.changeDiscordNickname(`[${server.name}] ${nickname}`, `Joined ${server.name}`);
        await this.save();
    }

    schema.methods.changeDiscordNickname = async function (name, reason) {
        try {
            await this.discord_user.setNickname(name, reason);
        } catch (error) {
            if (!this.owner) {
                log(error);
            } else {
                log("Cannot change owner's nickname");
            }
        }
    }
}