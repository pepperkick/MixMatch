const log = require('debug')('app:models:player');

module.exports = (schema) => {    
    const statuses = Object.freeze({
        FREE: "FREE",
        JOINED: "JOINED"
    });

    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.FREE
        }
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
        this.status = statuses.FREE;
        this.server = null;

        await this.save();
    }

    schema.methods.joinServer = async function (server) {
        this.status = statuses.JOINED;
        this.server = server.id;

        this.changeDiscordNickname(`[${server.name}] <nickname>`, `Joined ${server.name}`);

        await this.save();
    }

    schema.methods.changeDiscordNickname = async function (name, reason) {
        this.model("Player").events.emit("discord_change_nickname", { doc: this, name, reason });
    }
}