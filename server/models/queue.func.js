const Gamedig = require('gamedig');

const Exception = require("../objects/exception");

const log = require('debug')('app:models:queue');
module.exports = (schema) => {
    const statuses = Object.freeze({
        UNKNOWN: 'unknown',
        OUTDATED: 'outdated',
        FREE: 'free',
        SETUP: 'setup',
        WAITING: 'waiting',
        LIVE: 'live',
        ENDED: 'ended',
        ERROR: 'error'
    });

    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.UNKNOWN
        },
        teamA: {
            type: Array,
            default: []
        },
        teamB: {
            type: Array,
            default: []
        }
    });

    schema.statics.status = statuses;

    schema.statics.findByName = async function (name) {
        return await this.findOne({ name });
    }

    schema.statics.findByIp = async function (ip, port) {
        return await this.findOne({ ip, port });
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
        
        log(`${this.name}'s status changed to ${this.status}`);
    }

    schema.methods.isFree = function () {
        return this.status === statuses.FREE;
    }

    schema.methods.addPlayer = async function (player) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("queue").execPopulate();

        if (!player)
            throw new Exception("PLAYER_NOT_FOUND", `Player ${player.id} not found!`);

        if (player.queue && player.queue.id == this.id) 
            throw new Exception("PLAYER_ALREADY_IN_CURRENT_QUEUE", `Player ${player.id} is already in current queue`);

        if (player.queue !== null) 
            throw new Exception("PLAYER_ALREADY_IN_QUEUE", `Player ${player.id} is already in queue ${player.queue.id}`);

        if (!this.isFree())
            throw new Exception("QUEUE_NOT_FREE", `Queue status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        this.players.push(player.id);

        await player.joinQueue(this);
        await this.save();

        log(`${this.name}: Added Player ${player.id} (${player.discord})`);

        return true;
    }

    schema.methods.removePlayer = async function (player, force = false) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("queue").execPopulate();

        if (!force) {
            if (player.queue === null) 
                throw new Exception("PLAYER_NOT_IN_QUEUE", `Player ${player.id} is not in any queue`);

            if (player.queue && player.queue.id != this.id) 
                throw new Exception("PLAYER_NOT_IN_CURRENT_QUEUE", `Player ${player.id} is not in current queue`);

            if (!this.isFree())
                throw new Exception("QUEUE_NOT_FREE", `Queue status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);
        }

        for (const i in this.players) {
            if (this.players[i].toString() === player.id.toString()) {
                this.players.splice(i, 1);

                break;
            }
        }

        await player.leaveQueue();
        await this.save();

        log(`${this.name}: Removed Player ${player.id} (${player.discord})`);

        return true;
    }
    
    schema.methods.reset = async function () {
        await this.setStatus(statuses.FREE);
        await this.sendRconCommand("mx_reset");

        for (const player of this.players) {
            await this.removePlayer(player, true);
        }

        for (const player of this.teamA) {
            await this.removePlayer(player, true);
        }

        for (const player of this.teamB) {
            await this.removePlayer(player, true);
        }

        this.teamA = [];
        this.teamB = [];

        await this.save();
    }

    schema.methods.changeFormat = async function (format) {
        if (this.format === format)
            throw new Exception("FORMAT_SAME", `Queue format is already ${format}`);

        if (!this.isFree())
            throw new Exception("QUEUE_STATUS_NOT_FREE", `Queue status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        if (this.players.length !== 0)
            throw new Exception("QUEUE_NOT_FREE", `Queue's queue currently has players, the Queue format cannot change while players still in queue. `);

        this.format = format;

        await this.sendRconCommand(`mx_set_format ${this.format}`);

        await this.save();
    }

    schema.methods.sendDiscordMessage = async function (options) {        
        const message = await this.discordChannel.send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);
      
        if (!message) {
            throw new Error(`Failed to send message to channel ${channel.id}`);
        }
      
        return message;
    }

    schema.methods.setDiscordRoleName = async function (name) {
        await this.discordRole.setName(name);
    }

    schema.methods.sendRconCommand = async function (command) {
        return this.rconConn.send(command);
    }
    
    schema.methods.queryGameServer = async function () {
        return Gamedig.query({
            host: this.ip,
            port: this.port,
            type: 'tf2'
        })
    }
}