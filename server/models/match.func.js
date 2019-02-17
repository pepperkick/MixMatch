const sleep = require('async-sleep');
const log = require('debug')('app:models:match');

let cache = {};

module.exports = (schema) => {
    const statuses = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        SETUP: 'SETUP',
        WAITING: 'WAITING',
        KNIFE: 'KNIFE',
        VOTING: 'VOTING',
        LIVE: 'LIVE',
        ENDED: 'ENDED',
        ERROR: 'ERROR',
        CANCELED: "CANCELED"
    });
    
    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.UNKNOWN
        }
    });

    schema.statics.status = statuses;

    schema.statics.isPlayerAssigned = async function (id) {
        const matches = this.find({ status: statuses.WAITING });

        for (let i in matches) {
            if (await matches[i].isPlayerPlaying(id)) return match;
        }

        return null;
    }

    schema.statics.isPlayerPlaying = async function (id) {
        const matches = this.find({ status: statuses.LIVE });

        for (let i in matches) {
            if (await matches[i].isPlayerPlaying(id)) return match;
        }

        return null;
    }

    schema.methods.isPlayerPlaying = async function (id) {
        const player = await this.model("Player").findBySteam(id);

        if (this.players[player.id.toString()]) return true;
        return false;
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
        
        log(`Match ${this.id}'s status changed to ${this.status}`);
    }

    schema.methods.handleMapChange = async function (event) {
        const Server = await this.model('Server');
        const config = this.getConfig();
        const format = config.formats[this.format];
        const { map } = event.data;

        if (this.status === statuses.SETUP && this.map === map) {
            const server = await Server.findById(this.server);

            await server.execConfig(format.config);

            await this.setStatus(statuses.WAITING);
        } else if (this.status === statuses.WAITING && this.map !== map) {
            await this.setStatus(statuses.SETUP);
        } else if (this.status === statuses.LIVE && this.map !== map) {
            await this.setStatus(statuses.ERROR);

            throw new Error("Map changed in the middle of a live match");
        }
    }

    schema.methods.handleOnPlayerConnect = async function (event) {
        const Server = await this.model('Server');
        const server = await Server.findById(this.server);
        const config = this.getConfig();
        const format = config.formats[this.format];
        const { steamId, client } = event.data;

        if (this.status === statuses.SETUP) {
            return await server.commands.kick(client, "Match is not ready yet, join back later");
        } else if (this.status === statuses.WAITING) {    
            const num = await server.getNumberOfPlayers();

            log(`Number of players: ${num}`);

            await server.discordRole.setName(`${server.name}: Waiting (${num}/${format.size * 2})`);

            if (num === format.size * 2) {
                log(`Enough players have joined ${server.name}, turning on knife round.`);

                await server.execConfig("csgo_kniferound");
                await this.setStatus(statuses.KNIFE);
            }
        } else if ([statuses.KNIFE, statuses.LIVE].includes(this.status)) {
            if (this.isPlayerPlaying(steamId));
            else return await server.commands.kick(client, "You cannot join this match");
        }
    }

    schema.methods.handleOnRoundEnd = async function (event) {
        const Server = await this.model('Server');
        const server = await Server.findById(this.server);
        const config = this.getConfig();
        const format = config.formats[this.format];

        if (this.status === statuses.WAITING) {
            await this.setStatus(statuses.CANCELED);
        } else if (this.status === statuses.KNIFE) {
            await server.execConfig(format.config);
            await sleep(5000);
            await server.rconConn.send("mp_warmuptime 30");
            await server.rconConn.send("mp_restartgame 1");
            await server.rconConn.send("mp_warmup_start");
            await this.setStatus(Match.status.VOTING);  
        }
    }

    schema.methods.handleOnRoundStart = async function (event) {
        log(event);

        if (this.status === statuses.KNIFE) {
            
        }
    }

    schema.methods.handleOnKill = async function (event) {
        log(event);
        
        if (this.status === statuses.KNIFE) {
            
        }
    }

    schema.post('save', async function (match) {
        const Match = match.model("Match");
        const Server = match.model("Server");

        const config = match.getConfig();
        const format = config.formats[match.format];
        const server = await Server.findById(match.server);

        if (match.status === Match.status.SETUP) {
            await server.commands.changeLevel(match.map);
            await server.createDiscordChannels();
            await server.moveDiscordPlayers();
            await server.discordRole.setName(`${server.name}: Setting Up`);
            await server.setStatus(Server.status.RESERVED);
            await server.save();
        } else if (match.status === Match.status.WAITING) {
            await server.discordRole.setName(`${server.name}: Waiting (0/${format.size * 2})`);
        } else if (match.status === Match.status.KNIFE) {
            await server.discordRole.setName(`${server.name}: Knife Round`);
        } else if (match.status === Match.status.LIVE) {
            await server.discordRole.setName(`${server.name}: Live`);
        } else if (match.status === Match.status.ENDED) {
            await server.discordRole.setName(`${server.name}: Ended`);      
            await server.setStatus(Server.status.FREE);  

            for (let i in match.players) {
                await match.players[i].discordMember.removeRole(app.config.teams.A.role);
                await match.players[i].discordMember.removeRole(app.config.teams.B.role);
                await match.players[i].discordMember.removeRole(server.role);
            }
        } else if (match.status === Match.status.ERROR) {     
            await server.setStatus(Server.status.FREE);  
        }  else if (match.status === Match.status.CANCELED) {     
            await server.setStatus(Server.status.FREE);  
        } else {   
            await match.setStatus(Match.status.ERROR);  
        }
    });
};