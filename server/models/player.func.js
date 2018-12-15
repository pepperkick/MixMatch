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
        await this.removeDiscordRole(this.server.role);

        this.status = statuses.FREE;
        this.server = null;

        await this.save();

        this.model('Player').events.emit('player_left_server', this);
    }

    schema.methods.joinServer = async function (server) {
        this.status = statuses.JOINED;
        this.server = server.id;

        await this.addDiscordRole(server.role);
        await this.save();

        this.model('Player').events.emit('player_joined_server', this);
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

    schema.methods.addDiscordRole = async function (role_id) {
        await this.discord_user.addRole(role_id);
    }

    schema.methods.removeDiscordRole = async function (role_id) {
        await this.discord_user.removeRole(role_id);
    }
}