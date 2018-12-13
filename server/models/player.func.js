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
        if (typeof user === String || typeof user == "string" || typeof user === Number) {
            return await this.findOne({ discord: user });
        }

        return await this.findOne({ discord: user.id });
    }

    schema.statics.findBySteam = async function (id) {
        return await this.findOne({ steam: id });
    }

    schema.statics.checkOrGet = async function (player) {
        if (typeof player == String || typeof player == "string" || typeof player == Number) {
            return this.findByDiscord(player);
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

        await this.save();
    }
}