const sleep = require('async-sleep');
const log = require('debug')('app:models:match');

let cache = {};

module.exports = (schema, app) => {
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

        log("Map Changed:", map);

        if (this.status === statuses.SETUP && this.map === map) {
            const server = await Server.findById(this.server);

            log(app.config.game);

            if (app.config.game === "tf2") {
                await sleep(15000);
                await server.execConfig(format.config);
            } else if (app.config.game === "csgo") {
                await server.execConfig(format.config);
            }

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

            if (app.config.game === "csgo") {
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

                    await server.commands.announce("all", "Starting knife round");
                    await this.setStatus(statuses.KNIFE);
                }
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
        
        if (app.config.game === "csgo") {
            if (this.status === statuses.KNIFE) {
                await this.setStatus(statuses.VOTING);  
                await sleep(30000);
                await server.execConfig(format.config);
                await sleep(5000);
                await server.sendCommand("mp_warmuptime 10");
                await server.sendCommand("mp_restartgame 1");
                await server.sendCommand("mp_warmup_start");
                await server.commands.announce("all", "Going LIVE after warmup!");
            }
        }
    }

    schema.methods.handleOnRoundStart = async function (event) {
        if (this.status === statuses.LIVE) {
            if (app.config.game === "csgo") {
                this.stats.round++;

                const stats = {};
                for (let i in this.players) {
                    stats[i] = {
                        kills: 0,
                        deaths: 0
                    }
                }

                this.stats.rounds[this.stats.round] = stats;
                this.markModified('stats');

                await this.save();
            }
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
                if (app.config.game === "csgo") {
                    await this.setStatus(statuses.KNIFE);
                } else if (app.config.game === "tf2") {
                    await this.setStatus(statuses.LIVE);
                }
            }
        } else if (this.status === statuses.VOTING) {
            this.setStatus(statuses.LIVE);

            this.stats = {
                round: 0,
                rounds: []
            };

            this.markModified('stats');
            await this.save();
        }
    }

    schema.methods.handleOnMatchEnd = async function (event) {
        if (this.status === statuses.LIVE) {
            this.setStatus(statuses.ENDED);
        }
    }

    schema.methods.handleGameOver = async function (event) {
        if (this.status === statuses.LIVE) {
            this.setStatus(statuses.ENDED);
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
        } else if (this.status === statuses.LIVE) {
            const kid = event.data.steamId;
            const vid = event.data.victim_steamId;
            
            const killer = await Player.findBySteam(kid);
            const victim = await Player.findBySteam(vid);

            if (kid === vid) {
                this.stats.rounds[this.stats.round][killer.id].deaths++;
            } else {
                this.stats.rounds[this.stats.round][killer.id].kills++;
                this.stats.rounds[this.stats.round][victim.id].deaths++;
            }

            this.markModified('stats');
            await this.save();
        }
    }

    schema.methods.handleOnSay = async function (event, all=false) {
        log("HandleOnSay", all, this.status, event.data.message);

        if (this.status === statuses.VOTING) {
            const msg = event.data.message;
            const team = event.data.team;
            const steamId = event.data.steamId;
            const config = this.getConfig();
            const format = config.formats[this.format];

            log(msg, team, steamId);
            log(team === this.prefs.knife_winner)

            if (team === this.prefs.knife_winner && !this.prefs.vote_submitted[steamId]) {
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

    schema.methods.handleLogUpload = async function (event) {
        const id = event.data.id;

        this.prefs.logstf = id;
        this.markModified('prefs');

        log(`[LOGSTF] ${id}`);

        await this.save();
    }

    schema.methods.handleDemoUpload = async function (event) {
        const id = event.data.id;

        this.prefs.demostf = id;
        this.markModified('prefs');

        log(`[DEMOSTF] ${id}`);

        await this.save();
    }

    schema.methods.postEndResult = async function () {
        const channel = app.config.discord.main;
        const fields = [];
        const embed = {
            color: 0x00BCD4,
            title: `Server`,
            fields
        }

        fields.push({
            name: 'Format',
            value: this.format,
            inline: true
        });

        fields.push({
            name: 'Map',
            value: this.map,
            inline: true
        });

        if (this.prefs.logstf) {
            fields.push({
                name: 'Logs.tf',
                value: this.prefs.logstf
            });
        }

        if (this.prefs.demostf) {
            fields.push({
                name: 'Logs.tf',
                value: this.prefs.demostf
            });
        }
    }

    schema.pre('save', async function (next) {
        const Server = this.model("Server");
        const server = await Server.findById(this.server);

        if (this.status === statuses.VOTING && this.prefs.vote_switch === 0) {
            if (this.prefs.knife_ts > this.prefs.knife_cts) {
                this.prefs.knife_winner = Team.T;
            } else if (this.prefs.knife_ts < this.prefs.knife_cts) {
                this.prefs.knife_winner = Team.CT;
            } else {
                const c = Math.floor(Math.random() * 2)
                this.prefs.knife_winner = c === 0 ? Team.T : Team.CT; 
            }

            if (this.prefs.knife_winner === Team.T) {
                await server.commands.announce("t", "Type !switch in chat if you want to switch teams.");
            } else if (this.prefs.knife_winner === Team.CT) {
                await server.commands.announce("ct", "Type !switch in chat if you want to switch teams.");
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
        const Player = match.model("Player");

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
            }, 30000);
            await server.sendDiscordMessage({ embed: {
                color: 0x00BCD4,
                title: `Server ${server.name}`,
                fields: [
                    {
                        name: 'Status',
                        value: 'Waiting for players to join'
                    },
                    {
                        name: "Connect",
                        value: `steam://connect/${server.ip}:${server.port}`,
                        inline: false
                    },
                    {
                        name: 'Format',
                        value: match.format,
                        inline: true
                    },  
                    {
                        name: 'Map',
                        value: match.map,
                        inline: false
                    } 
                ],
                timestamp: new Date()
            }});
        } else if (match.status === Match.status.KNIFE) {
            await server.discordRole.setName(`${server.name}: Knife Round`);
            clearInterval(interval);
        }  else if (match.status === Match.status.VOTING) {
            await server.discordRole.setName(`${server.name}: Voting`);
        } else if (match.status === Match.status.LIVE) {
            await server.discordRole.setName(`${server.name}: Live`);
            clearInterval(interval);
        } else if (match.status === Match.status.ENDED) {
            await server.discordRole.setName(`${server.name}: Ended`);      
            
            await sleep(30 * 1000);

            for (let i in match.players) {
                const player = await Player.findById(i);

                await player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 
                await player.discordMember.removeRole(server.role);
                await player.discordMember.removeRole(app.config.teams.A.role);
                await player.discordMember.removeRole(app.config.teams.B.role);
            }

            await sleep(30 * 1000);

            await server.setStatus(Server.status.FREE);  
            // await match.postEndResult();
            await server.deleteDiscordChannels();  
            await server.commands.changeLevel(match.map);
        } else if (match.status === Match.status.ERROR) {     
            await server.setStatus(Server.status.FREE);  
        }  else if (match.status === Match.status.CANCELED) {     
            await server.setStatus(Server.status.FREE);  

            for (let i in match.players) {
                const player = await Player.findById(i);

                await player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 
                await player.discordMember.removeRole(server.role);
                await player.discordMember.removeRole(app.config.teams.A.role);
                await player.discordMember.removeRole(app.config.teams.B.role);
            }

            await server.deleteDiscordChannels();  
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

        if (match.status === statuses.WAITING)
            await server.discordRole.setName(`${server.name}: Waiting (${num < 0 ? 0 : num}/${format.size * 2})`);

        if (((new Date) - match.matchStartTime) > cooldown) {
            if (match.status === statuses.WAITING && num !== format.size * 2) {
                log(`Match ${match.id} has gone past cooldown and only (${num} / ${format.size * 2}) players joined. So the match will be cancelled.`);

                await match.setStatus(statuses.CANCELED);
            }

            clearInterval(interval);
        }
    }
};