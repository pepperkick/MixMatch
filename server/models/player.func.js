const log = require('debug')('app:models:player');

module.exports = (schema, app) => {    
    const statuses = Object.freeze({
        FREE: "FREE",
        JOINED: "JOINED",
        CONNECTED: "CONNECTED"
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

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
    }

    schema.methods.leaveQueue = async function () {
        try {
            await this.discordMember.removeRole(this.queue.role);
        } catch (error) {
            log(error);
        }

        this.status = statuses.FREE;
        this.queue = null;

        await this.save();

        this.model(this.constructor.modelName).emit('player_left_queue', this);
    }

    schema.methods.joinQueue = async function (queue) {
        this.status = statuses.JOINED;
        this.queue = queue.id;

        await this.discordMember.addRole(queue.role);
        await this.save();

        this.model(this.constructor.modelName).emit('player_joined_queue', this);
    }
}