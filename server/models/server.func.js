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
        ENDED: 'ended',
        ERROR: 'error'
    });

    let conns = {};
    let channels = {};
    let roles = {};
    let prefs = {};

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

    schema.virtual('conn').set(function(rcon) {
        conns[this.id] = rcon;
    });

    schema.virtual('conn').get(function() {
        if (!conns[this.id]) throw new Error(`RCON connection for server ${this.name} does not exist.`)

        return conns[this.id];
    });

    schema.virtual('discord_channel').set(function(channel) {
        channels[this.id] = channel;
    });

    schema.virtual('discord_channel').get(function() {
        if (!channels[this.id]) throw new Error(`Channel for server ${this.name} does not exist.`)

        return channels[this.id];
    });

    schema.virtual('discord_role').set(function(role) {
        roles[this.id] = role;
    });

    schema.virtual('discord_role').get(function() {
        if (!roles[this.id]) throw new Error(`Role for server ${this.name} does not exist.`)

        return roles[this.id];
    });

    schema.virtual("commands_status").set(function (state) {
        if (!prefs[this.id]) prefs[this.id] = {};

        prefs[this.id].command_status = state;
    });

    schema.virtual("commands_status").get(function () {
        return (prefs[this.id] && prefs[this.id].command_status) || 'unknown';
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
    }

    schema.methods.isFree = function () {
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

        log(`${this.name}: Added Player ${player.id} (${player.discord})`);

        return true;
    }

    schema.methods.removePlayer = async function (player, force = false) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("server").execPopulate();

        if (!force) {
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
        }

        await player.leaveServer();
        await this.save();

        log(`${this.name}: Removed Player ${player.id} (${player.discord})`);

        return true;
    }
    
    schema.methods.removeAllPlayers = async function () {
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

        await this.setStatus(statuses.FREE);
        await this.sendRconCommand("mx_reset");
    }

    schema.methods.changeFormat = async function (format) {
        if (this.format === format)
            throw new Exception("FORMAT_SAME", `Server format is already ${format}`);

        if (!this.isFree())
            throw new Exception("SERVER_NOT_FREE", `Server status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        if (this.players.length !== 0)
            throw new Exception("QUEUE_NOT_FREE", `Server's queue currently has players, the server format cannot change while players still in queue. `);

        this.format = format;

        await this.sendRconCommand(`mx_setformat ${this.format}`);

        await this.save();
    }

    schema.methods.sendDiscordMessage = async function (options) {        
        const message = await this.channel.send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);
      
        if (!message) {
            throw new Error(`Failed to send message to channel ${channel.id}`);
        }
      
        return message;
    }

    schema.methods.setDiscordRoleName = async function (name) {
        await this.discord_role.setName(name);
    }

    schema.methods.sendRconCommand = async function (command) {
        return this.conn.send(command);
    }
}