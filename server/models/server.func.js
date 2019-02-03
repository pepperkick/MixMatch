const Gamedig = require('gamedig');

const Exception = require("../objects/exception");

const log = require('debug')('app:models:server');

let cache = {};

module.exports = (schema) => {
    const statuses = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        OUTDATED: 'OUTDATED',
        FREE: 'FREE',
        RESERVED: 'RESERVED',
        SETUP: 'SETUP',
        WAITING: 'WAITING',
        LIVE: 'LIVE',
        ENDED: 'ENDED',
        COOLDOWN: 'COOLDOWN',
        ERROR: 'ERROR'
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

    schema.statics.findByIp = async function (ip) {
        return await this.findOne({ ip });
    }

    schema.statics.findFreeServer = async function () {
        const server = await this.findOne({ status: statuses.FREE });        
    
        if (!server) throw new Error("No free server found");

        return server;
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
        
        log(`Server ${this.name}'s status changed to ${this.status}`);
    }

    schema.methods.setFormat = async function (format) {
        this.format = format;

        await this.save();

        log(`Server ${this.name}'s format changed to ${this.format}`);
    }

    schema.methods.isFree = function () {
        return this.status === statuses.FREE;
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
        this.events.on("Log_onRCONCommand", log);
        this.events.on("Log_onPlayerConnected", log);
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