const fs = require('fs');
const readline = require('readline');
const Gamedig = require('gamedig');

const Exception = require("../objects/exception");

const log = require('debug')('app:models:server');

let cache = {};

module.exports = (schema, app) => {
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
        if (typeof ip === 'string') {
            const parts = ip.split(":");

            if (parts.length > 1) {
                return await this.findOne({ ip: parts[0], port: parts[1] });
            } else {                
                return await this.findOne({ ip: parts[0] });
            }
        }

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
        const matches = await Match.find({ status: { $in: [ Match.status.SETUP, Match.status.WAITING, Match.status.KNIFE, Match.status.VOTING, Match.status.LIVE ] }, server: this });

        if (matches.length > 0) {
            return matches[0];
        }

        return null;
    }

    schema.methods.sendDiscordMessage = async function (options) {        
        const message = await this.getDiscordTextChannel().send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);

        if (!message) {
            throw new Error(`Failed to send message to server channel ${this.name}`);
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

    schema.methods.getGameStatus = async function () {
        return this.commands.status();
    }

    schema.methods.getGameStatusPlayers = async function () {
        const status = await this.getGameStatus();

        if (!status) return -1;

        let regex;

        if (this.game === "tf2") {
            regex = /# ( |)(.*?) (.*?) \"(.*?)\"(.*?)\[(.*?)\](.*)/gmi;
        } else if (this.game === "csgo") {
            regex = /# ( |)(.*?) (.*?) \"(.*?)\" (.*?) (.*?):(.*?) (.*?) (.*?) (.*?) (.*?) (.*?)\n/gmi;
        }
        const data = status.match(regex);
        const players = [];

        if (!data || data.length === 0) return;

        for (let i = 0; i < data.length; i++) {
            if (data[i].includes("# ")) players.push(data[i]);
        }

        return players;
    }

    schema.methods.getNumberOfPlayers = async function () {
        const players = await this.getGameStatusPlayers();

        if (!players) return -1;

        return players.length;
    }

    schema.methods.createDiscordChannels = async function () {
        log(`Creating discord channels for server ${this.name}`);

        const config = app.config;

        if (!this.discordChannel.children || this.discordChannel.children.size !== 4) {
            const guild = this.getDiscordGuild();

            await this.deleteDiscordChannels();

            let channel;

            log(this.role);

            channel = await guild.createChannel("general", "text", [{
                id: this.role,
                allowed: [ 'SEND_MESSAGES', 'READ_MESSAGES' ]
            }, {
                id: guild.id,
                denied: [ 'SEND_MESSAGES', 'READ_MESSAGES' ]
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

    schema.methods.deleteDiscordChannels = async function () {
        if (this.discordChannel.children) {
            this.discordChannel.children.every(async function (channel) {
                await channel.delete();
                return true;
            });
        }
    }

    schema.methods.moveDiscordPlayers = async function () {
        const Player = this.model('Player');
        const match = await this.getCurrentMatch();

        if (!match) return null;

        const players = match.players;

        for (let i in players) {
            const player = await Player.findById(i);

            if (players[i].team === "A") {
                player.discordMember.setVoiceChannel(this.getDiscordTeamAChannel()); 
            } else if (players[i].team === "B") {
                player.discordMember.setVoiceChannel(this.getDiscordTeamBChannel()); 
            }
        
            await player.discordMember.addRole(this.role);
        }
    }

    schema.methods.Log_onMapChange = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleMapChange(event);
    };

    schema.methods.Log_onRoundStart = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnRoundStart(event);
    };

    schema.methods.Log_onRoundEnd = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnRoundEnd(event);
    };

    schema.methods.Log_onMatchStart = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnMatchStart(event);
    };

    schema.methods.Log_onMatchEnd = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnMatchEnd(event);
    };

    schema.methods.Log_onKill = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnKill(event);
    };

    schema.methods.Log_onSayAll = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnSay(event, true);
    }

    schema.methods.Log_onSayTeam = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleOnSay(event, false);
    }

    schema.methods.Log_onGameOver = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleGameOver(event);
    }

    schema.methods.Log_onLogstfUpload = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleLogUpload(event);
    }

    schema.methods.Log_onDemostfUpload = async function (event) {
        const match = await this.getCurrentMatch();

        if (match) await match.handleDemoUpload(event);
    }

    schema.methods.Log_onPlayerConnected = async function (event) {
        const Player = this.model('Player');
        const { steamId, client } = event.data;

        log(`Player ${steamId} connected to server ${this.name} (${this.status})`);

        if (steamId === "BOT") return;

        if (this.status === statuses.UNKNOWN) {
            return await this.commands.kick(client, "Server is not ready to accept connections");
        } else if (this.status === statuses.FREE) {
            return await this.commands.kick(client, "Server is not currently accepting connections");
        } else if (this.status === statuses.RESERVED) {
        } else {
            return await this.commands.kick(client, "Unable to join currently");
        }

        const player = await Player.findBySteam(steamId);
        const match = await this.getCurrentMatch();

        if (match);
        else return await this.commands.kick(client, "Something is not right, please try again later");

        if (player) {
            if (await match.isPlayerPlaying(steamId));
            else {
                return await this.commands.kick(client, "You cannot join this match");
            }

            await match.handleOnPlayerConnect(event);
        } else {
            return await this.commands.kick(client, "You need to register with MixMatch to join the matches");
        }
    };

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

    schema.post('save', async function (server) {
        const Server = server.model("Server");

        if (server.status === Server.status.UNKNOWN) {
            const match = await server.getCurrentMatch();
            
            if (server.isRconConnected);
            else return setTimeout(() => server.retryRconConnection(), 10000);

            if (match) { 
                await server.setStatus(Server.status.RESERVED);
                await match.setStatus(match.status);
            }
            else server.setStatus(Server.status.FREE);
        } else if (server.status === Server.status.FREE) {
            await server.discordRole.setName(`${server.name}: Free`);
        }
    });
}