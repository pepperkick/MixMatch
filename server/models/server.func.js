const Exception = require("../objects/exception");

const log = require('debug')('app:models:server');

module.exports = (schema) => {
    const statuses = Object.freeze({
        UNKNOWN: 'unknown',
        OUTDATED: 'outdated',
        FREE: 'free',
        SETUP: 'setup',
        WAITING: 'waiting',
        LIVE: 'live',
        ENDED: 'ended'
    });

    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.UNKNOWN
        }
    });

    schema.statics.status = statuses;

    schema.statics.findByName = async function (name) {
        return await this.findOne({ name });
    }

    schema.statics.findByIP = async function (ip, port) {
        return await this.findOne({ ip, port });
    }

    schema.methods.free = async function () {
        this.status = statuses.FREE;

        await this.removeAllPlayers();
        await this.save();
    }

    schema.methods.addPlayer = async function (player) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("server").execPopulate();

        if (!player)
            throw new Exception("PLAYER_NOT_FOUND", `Player ${player.id} not found!`);

        if (player.server.id == this.id) 
            throw new Exception("PLAYER_ALREADY_IN_CURRENT_QUEUE", `Player ${player.id} is already in current queue`);

        if (player.server !== null) 
            throw new Exception("PLAYER_ALREADY_IN_QUEUE", `Player ${player.id} is already in queue ${player.server.id}`);

        if (this.status !== statuses.FREE)
            throw new Exception("SERVER_NOT_FREE", `Server status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        this.players.push(player.id);

        await player.joinServer(this);
        await this.save();

        log(`${this.name}: Added Player ${player.id}`);

        return true;
    }

    schema.methods.removePlayer = async function (player) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("server").execPopulate();

        if (player.server === null) 
            throw new Exception("PLAYER_NOT_IN_QUEUE", `Player ${player.id} is not in any queue`);

        if (player.server.id != this.id) 
            throw new Exception("PLAYER_NOT_IN_CURRENT_QUEUE", `Player ${player.id} is not in current queue`);

        if (this.status !== statuses.FREE)
            throw new Exception("SERVER_NOT_FREE", `Server status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        for (const i in this.players) {
            if (this.players[i].toString() === player.id.toString()) {
                this.players.splice(i, 1);

                break;
            }
        }

        await player.leaveServer();
        await this.save();

        log(`${this.name}: Removed Player ${player.id}`);

        return true;
    }
    
    schema.methods.removeAllPlayers = async function () {
        for (let i in this.players) {
            await this.removePlayer(players[i]);
        }
    }

    schema.methods.sendDiscordMessage = async function (message) {
        this.events.emit("discord_send_message", {
            doc: this,
            message
        })
    }
}