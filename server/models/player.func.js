const SteamID = require("steamid");
const log = require('debug')('app:models:player');

module.exports = (schema, app) => {    
    const statuses = Object.freeze({
        FREE: "FREE",
        JOINED: "JOINED",
        CONNECTED: "CONNECTED",
        PLAYING: "PLAYING"
    });

    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.FREE
        },
        prefs: {
            type: Object,
            default: {}
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
        const steam = new SteamID(id).getSteamID64();
        return await this.findOne({ steam });
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

    schema.statics.breakdownPlayerStatusLine = async function (line) {
        let regex;

        if (app.config.game === "tf2") {
            regex = /# (.*) (.*?) \"(.*?)\"(.*?)\[(.*)\]/;
        } else if (app.config.game === "csgo") {
            regex = "# ( |)(.*?) (.*?) \"(.*?)\" (.*?) (.*?):(.*?) (.*?) (.*?) (.*?) (.*?) (.*?)\n"
        }

        const data = line.match(regex);

        return data;
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
    }

    schema.methods.joinQueue = async function (queue) {
        this.status = statuses.JOINED;
        this.queue = queue.id;

        await this.discordMember.addRole(queue.role);
        await this.save();

        this.model(this.constructor.modelName).emit('player_joined_queue', this);
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

    schema.methods.setClass = async function (playerClass) {
        this.prefs.class = playerClass;
        this.markModified("prefs");

        await this.save();
    }

    schema.virtual("match.team").get(async function () {        
        // TODO: Fix
        // return this.match.players[this.id].team;
    });

    schema.virtual("match.client").get(async function () {
        // TODO: Fix
        // return this.match.players[this.id].client;
    });
}