const fs = require('fs');
const readline = require('readline');
const Gamedig = require('gamedig');

const Exception = require("../objects/exception");

const log = require('debug')('app:models:server');

let cache = {};

module.exports = (schema) => {
    const statuses = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        FREE: 'FREE',
        RESERVED: 'RESERVED',
        ERROR: 'ERROR'
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

    schema.statics.findByIp = async function (ip) {
        return await this.findOne({ ip });
    }

    schema.statics.findFreeServer = async function () {
        const server = await this.findOne({ status: statuses.FREE });        

        return server;
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
        
        log(`Server ${this.name}'s status changed to ${this.status}`);
    }

    schema.methods.execConfig = async function (config) {
        log(`Executing Local ${config}.cfg`);

        const fileStream = fs.createReadStream(`${__dirname}/../cfgs/${config}.cfg`);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        rl.on('line', async line => {
            if (line === "") return;
            if (line.indexOf("//") === 0) return;

            if (line.split("//").length > 1) {
                line = line.split("//")[0];
            }

            await this.sendCommand(line);
        });
    }

    schema.methods.isFree = function () {
        return this.status === statuses.FREE;
    }

    schema.methods.getCurrentMatch = async function () {
        const Match = await this.model('Match');
        const matches = await Match.find({ status: { $in: [ Match.status.SETUP, Match.status.WAITING, Match.status.LIVE ] }, server: this });

        if (matches.length > 0) {
            return matches[0];
        }

        return null;
    }

    schema.methods.sendDiscordMessage = async function (options) {        
        const message = await this.getDiscordTextChannel().send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);

        if (!message) {
            throw new Error(`Failed to send message to channel ${channel.id}`);
        }

        return message;
    }

    schema.methods.queryGameServer = async function () {
        return Gamedig.query({
            host: this.ip,
            port: this.port,
            type: 'tf2'
        })
    }

    schema.methods.createDiscordChannels = async function () {
        log(`Creating discord channels for server ${this.name}`);

        const config = this.getConfig();

        if (!this.discordChannel.children || this.discordChannel.children.size !== 4) {
            const guild = this.getDiscordGuild();

            if (this.discordChannel.children) {
                this.discordChannel.children.every(async function (channel) {
                    await channel.delete();

                    return true;
                });
            }

            let channel;

            channel = await guild.createChannel("general", "text", [{
                id: config.discord.roles.player,
                allowed: [ 'SEND_MESSAGES' ]
            }], `Server ${this.name} channel setup`);
            await channel.setParent(this.discordChannel);

            channel = await guild.createChannel(config.teams.A.name, "voice", [{
                id: config.teams.A.role,
                allowed: [ 'CONNECT' ]
            }, {
                id: guild.id,
                denied: [ 'CONNECT' ]
            }], `Server ${this.name} channel setup`);                
            await channel.setParent(this.discordChannel);

            channel = await guild.createChannel(config.teams.B.name, "voice", [{
                id: config.teams.B.role,
                allowed: [ 'CONNECT' ]
            }, {
                id: guild.id,
                denied: [ 'CONNECT' ]
            }], `Server ${this.name} channel setup`);                
            await channel.setParent(this.discordChannel);
        }
    }

    schema.methods.moveDiscordPlayers = async function () {
        const Player = this.model('Player');
        const match = await this.getCurrentMatch();

        if (!match) return null;

        const players = match.players;
        const that = this;

        for (let i in players) {
            const player = await Player.findById(i);

            if (players[i].team === "A") {
                player.discordMember.setVoiceChannel(that.getDiscordTeamAChannel()); 
            } else if (players[i].team === "B") {
                player.discordMember.setVoiceChannel(that.getDiscordTeamBChannel()); 
            }
        }
    }

    schema.methods.attachLogEvents = function () {
        const Match = this.model('Match');
        const server = this;

        log(`Attached log events for server ${this.name}`);

        this.events.on("Log_onMapChange", async function (event) {
            const match = await server.getCurrentMatch();

            if (match) await match.handleMapChange(event);
        });

        this.events.on("Log_onPlayerConnected", async function (event) {
            const { steamId, client } = event.data;

            log(`Player ${steamId} connected to server ${server.name}`);

            if (server.status === statuses.UNKNOWN) {
                return await server.commands.kick(client, "Server is not ready to accept connections");
            } else if (server.status === statuses.FREE) {
                return await server.commands.kick(client, "Server is not currently accepting connections");
            } else if (server.status === statuses.RESERVED) {
            } else {
                return await server.commands.kick(client, "Unable to join currently");
            }

            const player = await server.model('Player').findBySteam(steam_id);

            if (player) {
                if (await Match.isPlayerAssigned(player.id.toString()));
                else if (await Match.isPlayerPlaying(player.id.toString()));
                else {
                    return await server.commands.kick(client, "You cannot join this match");
                }
            } else {
                return await server.commands.kick(client, "You need to register with MixMatch to join the matches");
            }
        });
    }

    schema.methods.checkIfPlayerAssigned = function (player) {
        if (player.server.id.toString() !== this.id.toString()) {
            return false;
        }
    }

    schema.post('init', async doc => {
        try {
            if (cache[`${doc.id.toString()}`]) return;

            cache[`${doc.id.toString()}`] = true;
            
            await doc.setStatus(statuses.UNKNOWN);
        } catch (error) {
            log(error);
        }
    });
}