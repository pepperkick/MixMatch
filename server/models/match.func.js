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

    const Team = Object.freeze({
        T: "TERRORIST",
        CT: "CT"
    })
    
    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.UNKNOWN
        },
        matchStartTime: {
            type: Date
        },
        prefs: {
            type: Object,
            default: {}
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

            this.matchStartTime = new Date();

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
            const num = await server.getNumberOfPlayers() || 0;

            log(`Number of players: ${num}`);

            await server.discordRole.setName(`${server.name}: Waiting (${num}/${format.size * 2})`);

            if (num === format.size * 2) {
                log(`Enough players have joined ${server.name}, turning on knife round.`);

                await server.execConfig("csgo_kniferound");
                await server.sendCommand("mp_warmuptime 15");
                await server.sendCommand("mp_restartgame 1");
                await server.sendCommand("mp_warmup_start");

                this.prefs.knife_ts = 0;
                this.prefs.knife_cts = 0;
                this.prefs.vote_switch = 0;
                
                this.markModified('prefs');

                await this.setStatus(statuses.KNIFE);
            }
        } else if ([statuses.KNIFE, statuses.VOTING, statuses.LIVE].includes(this.status)) {
            if (this.isPlayerPlaying(steamId));
            else return await server.commands.kick(client, "You cannot join this match");
        }
    }

    schema.methods.handleOnRoundEnd = async function (event) {
        const Server = await this.model('Server');
        const server = await Server.findById(this.server);
        const config = this.getConfig();
        const format = config.formats[this.format];

        if (this.status === statuses.KNIFE) {
            await this.setStatus(statuses.VOTING);  
            await sleep(30000);
            await server.execConfig(format.config);
            await sleep(5000);
            await server.sendCommand("mp_warmuptime 10");
            await server.sendCommand("mp_restartgame 1");
            await server.sendCommand("mp_warmup_start");
        }
    }

    schema.methods.handleOnRoundStart = async function (event) {
        if (this.status === statuses.KNIFE) {

        }
    }

    schema.methods.handleOnMatchStart = async function (event) {
        const Server = await this.model('Server');
        const server = await Server.findById(this.server);
        const config = this.getConfig();
        const format = config.formats[this.format];
        const num = await server.getNumberOfPlayers();

        log(event);

        if (this.status === statuses.WAITING) {
            if (num > 1 && num < format.size * 2) {
                await this.setStatus(statuses.CANCELED);                
            } else if (num === format.size * 2) {
                await this.setStatus(statuses.KNIFE);        
            }
        } else if (this.status === statuses.VOTING) {
            this.setStatus(statuses.LIVE);
        }
    }

    schema.methods.handleOnKill = async function (event) {        
        if (this.status === statuses.KNIFE) {
            const kt = event.data.team;
            const vt = event.data.victim_team;

            if (kt === vt) {
                // TODO: find a way to handle this
            } else if (kt === Team.T) {
                this.prefs.knife_ts += 1;
            } else if (kt === Team.CT) {
                this.prefs.knife_cts += 1;
            }

            log(this.prefs);
            this.markModified('prefs');
            await this.save();
        }
    }

    schema.methods.handleOnSay = async function (event) {
        log("HandleOnSay", match.status, event.data.message);

        if (this.status === statuses.VOTING) {
            const msg = event.data.message;
            const team = event.data.team;
            const steamId = event.data.steamId;
            const config = this.getConfig();
            const format = config.formats[this.format];

            log(msg, team, steamId);
            log(team === this.prefs.knife_winner)
            log(!this.prefs.vote_submitted[steamId])

            if (team === this.prefs.knife_winner && !this.prefs.vote_submitted[steamId]) {
                log(msg === "!switch")
                if (msg === "!switch") {
                    this.prefs.vote_switch += 1;
                    this.prefs.vote_submitted[steamId] = true;

                    this.markModified('prefs');
                    await this.save();
                }
            }

            if (this.prefs.vote_switch > format.size / 2) {
                const Server = await this.model('Server');
                const server = await Server.findById(this.server);

                await server.sendCommand("mp_swapteams 1"); 
            }
        }
    }

    schema.pre('save', async function (next) {
        if (this.status === statuses.VOTING && this.prefs.vote_switch === 0) {
            if (this.prefs.knife_ts > this.prefs.knife_cts) {
                this.prefs.knife_winner = Team.T;
            } else if (this.prefs.knife_ts < this.prefs.knife_cts) {
                this.prefs.knife_winner = Team.CT;
            } else {
                const c = Math.floor(Math.random() * 2)
                this.prefs.knife_winner = c === 0 ? Team.T : Team.CT; 
            }

            this.prefs.vote_switch = 0;
            this.prefs.vote_submitted = [];

            this.markModified('prefs');

            next();
        }
    });

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
            const interval = setInterval(function () {
                checkMatchStatus(match, interval);
            }, 30000)
        } else if (match.status === Match.status.KNIFE) {
            await server.discordRole.setName(`${server.name}: Knife Round`);
        }  else if (match.status === Match.status.VOTING) {
            await server.discordRole.setName(`${server.name}: Voting`);
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

    async function checkMatchStatus(match, interval) {
        const Server = match.model("Server");

        const server = await Server.findById(match.server);
        const config = match.getConfig();
        const format = config.formats[match.format];
        const num = await server.getNumberOfPlayers();
        const cooldown = 5 * 60 * 1000;

        log(`Checking match cooldown ${(new Date) - match.matchStartTime} / ${cooldown}`);

        await server.discordRole.setName(`${server.name}: Waiting (${num}/${format.size * 2})`);

        if (((new Date) - match.matchStartTime) > cooldown) {
            if (match.status === statuses.WAITING && num !== format.size * 2) {
                log(`Match ${match.id} has gone past cooldown and only (${num} / ${format.size * 2}) players joined. So the match will be cancelled.`);

                await match.setStatus(statuses.CANCELED);
            }

            clearInterval(interval);
        }
    }
};