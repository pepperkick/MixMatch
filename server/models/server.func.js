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

            await this.rconConn.send(line);
        });
    }

    schema.methods.isFree = function () {
        return this.status === statuses.FREE;
    }

    schema.methods.findCurrentMatch = async function () {
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

    schema.methods.createDiscordChannel = async function () {
        // TODO: Fix issues.

        const server_config = getConfig(server[this.name]);

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
                id: this.getConfig(discord.roles.player),
                allowed: [ 'SEND_MESSAGES' ]
            }], `Server ${server.name} channel setup`);
            await channel.setParent(server.discordChannel);

            channel = await guild.createChannel(this.getConfig(teams.A.name), "voice", [{
                id: this.getConfig(teams.A.role),
                allowed: [ 'CONNECT' ]
            }, {
                id: guild.id,
                denied: [ 'CONNECT' ]
            }], `Server ${server.name} channel setup`);                
            await channel.setParent(server.discordChannel);

            channel = await guild.createChannel(this.getConfig(teams.B.name), "voice", [{
                id: this.getConfig(teams.B.role),
                allowed: [ 'CONNECT' ]
            }, {
                id: guild.id,
                denied: [ 'CONNECT' ]
            }], `Server ${server.name} channel setup`);                
            await channel.setParent(server.discordChannel);
        }
    }

    schema.methods.attachEvents = function () {
        this.events.on("Log_onMapChange", async data => {
            const { map } = data.data;
            const match = await this.findCurrentMatch();

            if (match) {
                if (match.status === Match.status.SETUP && match.map === map) {
                    match.status = Match.status.WAITING;

                    await match.save();
                } else if (match.status === Match.status.WAITING && match.map !== map) {
                    match.status = Match.status.SETUP;

                    await match.save();
                } else if (match.status === Match.status.LIVE && match.map !== map) {
                    match.status = Match.status.ERROR;

                    await match.save();

                    throw new Error("Map changed mid live match");
                }
            }
        });

        this.events.on("Log_onPlayerConnected", async data => {
            const { steam_id, client } = data.data;

            log(this.status);
            return;

            if (this.status === statuses.UNKNOWN) {
                return await this.sourcemod.kick(client, "Server is not ready to accept connections");
            } else if (this.status === statuses.FREE) {
                return await this.sourcemod.kick(client, "No match is currently going on in this server");
            } else if (this.status === statuses.SETUP) {
                return await this.sourcemod.kick(client, "Please join back later as server is setting up");
            } else if (this.status === statuses.WAITING) {
            } else {
                return await this.sourcemod.kick(client, "Unable to join currently");
            }

            const player = await this.model('Player').findBySteam(steam_id);

            if (player) {
                if (!this.checkIfPlayerAssigned(player)) {
                    return await this.sourcemod.kick(client, "You cannot join this match");
                }

            } else {
                return await this.sourcemod.kick(client, "You need to register with MixMatch to join the matches");
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
            // TODO: Make status as virtual

            if (cache[`${doc.ip}:${doc.port}`]) return;

            cache[`${doc.ip}:${doc.port}`] = true;

            await doc.attachEvents();
            await doc.setStatus(statuses.UNKNOWN);
        } catch (error) {
            log(error);
        }
    });
}