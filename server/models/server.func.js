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

    schema.methods.setFree = async function () {
        this.status = statuses.FREE;

        await this.removeAllPlayers();
        await this.save();
    }

    schema.methods.isFree = async function () {
        return this.status === statuses.FREE;
    }

    schema.methods.addPlayer = async function (player) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("server").execPopulate();

        if (!player)
            throw new Exception("PLAYER_NOT_FOUND", `Player ${player.id} not found!`);

        if (player.server && player.server.id == this.id) 
            throw new Exception("PLAYER_ALREADY_IN_CURRENT_QUEUE", `Player ${player.id} is already in current queue`);

        if (player.server !== null) 
            throw new Exception("PLAYER_ALREADY_IN_QUEUE", `Player ${player.id} is already in queue ${player.server.id}`);

        if (!this.isFree())
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

        if (player.server && player.server.id != this.id) 
            throw new Exception("PLAYER_NOT_IN_CURRENT_QUEUE", `Player ${player.id} is not in current queue`);

        if (!this.isFree())
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
        for (const player of this.players) {
            await this.removePlayer(player);
        }
    }

    schema.methods.changeFormat = async function (format) {
        if (this.format === format)
            throw new Exception("FORMAT_SAME", `Server format is already ${format}`);

        if (!this.isFree())
            throw new Exception("SERVER_NOT_FREE", `Server status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        if (this.players.length !== 0)
            throw new Exception("QUEUE_NOT_FREE", `Server's queue currently has players, the server format cannot change while players still in queue. `);

        this.format = format;

        await this.save();
    }

    schema.methods.sendDiscordMessage = async function (message) {
        this.model("Server").events.emit("discord_send_message", {
            doc: this,
            message
        });
    }
}