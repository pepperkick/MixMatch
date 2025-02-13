const sleep = require('async-sleep');
const request = require('async-request');
const log = require('debug')('app:models:match');

let cache = {};
let interval = {};
const list_index = [ "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const list_reactions = [
    "\u0031\u20E3", "\u0032\u20E3", "\u0033\u20E3", "\u0034\u20E3", 
    "\u0035\u20E3", "\u0036\u20E3", "\u0037\u20E3", "\u0038\u20E3",
    "\u0039\u20E3", "\u0030\u20E3"
];

module.exports = (schema, app) => {
    const statuses = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        PICKING: 'PICKING',
        MAPVOTING: 'MAPVOTING',
        SETUP: 'SETUP',
        WAITING: 'WAITING',
        KNIFE: 'KNIFE',
        VOTING: 'VOTING',
        LIVE: 'LIVE',
        POSTMATCH: 'POSTMATCH',
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

    schema.statics.isPlayerSelected= async function (player) {
        const matches = await this.find({ status: statuses.PICKING });

        for (let i = 0; i < matches.length; i++) {
            if (await matches[i].isPlayerPlaying(player)) return matches[i];
        }

        return null;
    }

    schema.statics.isPlayerWaiting = async function (player) {
        const matches = await this.find({ status: statuses.WAITING });

        for (let i = 0; i < matches.length; i++) {
            if (await matches[i].isPlayerPlaying(player)) return matches[i];
        }

        return null;
    }

    schema.statics.isPlayerPlaying = async function (player) {
        const matches = await this.find({ status: statuses.LIVE });

        for (let i = 0; i < matches.length; i++) {
            if (await matches[i].isPlayerPlaying(player)) return matches[i];
        }

        return null;
    }

    schema.methods.isPlayerPlaying = async function (player) {
        if (this.players[player.id.toString()]) return true;
        return false;
    }

    schema.methods.getPlayer = async function (player) {
        if (this.players[player.id.toString()]) return this.players[player.id.toString()];
        return false;
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        log(`Match ${this.id}'s status changed to ${this.status}`);
        
        await this.save();
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

            server.discordRole.setName(`${server.name}: Waiting (${num}/${format.size * 2})`);

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
            const player = await this.model("Player").findBySteam(steamId);
            if (this.isPlayerPlaying(player));
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
            this.setStatus(statuses.POSTMATCH);
        }
    }

    schema.methods.handleGameOver = async function (event) {
        if (this.status === statuses.LIVE) {
            this.setStatus(statuses.POSTMATCH);
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

    schema.methods.initPickPlayer = async function () {
        const Player = this.model("Player");
        const Match = this.model("Match");
        const picking = this.selected.length % 2;
        let capA, capB;

        if (this.prefs.capA && this.prefs.capB) {
            capA = this.prefs.capA;
            capB = this.prefs.capB;
        } else {
            for (let i in this.players) {
                if (this.players[i].team === "A" && this.players[i].captain) capA = i;
                if (this.players[i].team === "B" && this.players[i].captain) capB = i;
            }

            for (let j = 0; j < this.selected.length; j++) {
                if (this.selected[j].toString() == capA) {
                    this.selected.splice(j, 1);
                    break;
                }
            }
            for (j = 0; j < this.selected.length; j++) {
                if (this.selected[j].toString() == capB) {
                    this.selected.splice(j, 1);
                    break;
                }
            }
    
            this.prefs.capA = capA;
            this.prefs.capB = capB;

            this.markModified("prefs");
            this.markModified("selected");
            
            return await this.save();
        }

        if (this.selected.length == 1) {
            return await this.pickPlayer(0);
        } else if (this.selected.length == 0) {
            return await this.setStatus(statuses.MAPVOTING);
        }

        const fields = [];
        const embed = {
            color: 0x00BCD4,
            title: "Pick Menu",
            description: "Reply !pick <number> to pick that player",
            fields
        }

        let players = "";
        let teamA = "", teamB = "";
        for (let i = 0; i < this.selected.length; i++) {
            const player = await Player.findById(this.selected[i]);

            players += `**${i+1}**: ${player.discordMember.user.tag}`
            
            if (player.prefs && player.prefs.class) {
                players += ` (${player.prefs.class})`;
            }

            players += "\n";
        }

        for (i in this.players) {
            const player = await Player.findById(i);

            if (player) {
                let msg = "";

                if (this.players[i].captain) 
                    msg += `**${player.discordMember.user.tag}**`;
                else
                    msg += `${player.discordMember.user.tag}`;

                if (player.prefs && player.prefs.class)
                    msg += ` (${player.prefs.class})`;
        
                msg += "\n";

                if (this.players[i].team === "A") {
                    teamA += msg;
                } else if (this.players[i].team === "B") {
                    teamB += msg;
                }
            }
        }

        fields.push({
            name: "Players",
            value: players
        });
        fields.push({
            name: app.config.teams.A.name,
            value: teamA,
            inline: true
        });
        fields.push({
            name: app.config.teams.B.name,
            value: teamB,
            inline: true
        });

        log(capA, capB, picking);
        if (picking === 0) {
            const player = await Player.findById(capA);
            await player.discordMember.send("", { embed });
        } else {
            const player = await Player.findById(capB);
            await player.discordMember.send("", { embed });
        }
            
        const val = this.selected.length;

        setInterval(async () => {            
            const match = await Match.findById(this.id);
            
            if (match.selected.length === val) {
                log("Captain took too long to pick, picking randomly");

                const player = await match.pickPlayer(Math.floor(Math.random() * match.selected.length));

                if (picking === 0) {
                    const capA = await Player.findById(capA);
                    await capA.discordMember.send(`Picked ${player.discordMember.user.tag} randomly as you took too long to pick`);
                } else {
                    const capB = await Player.findById(capB);
                    await capB.discordMember.send(`Picked ${player.discordMember.user.tag} randomly as you took too long to pick`);
                }
            }
        }, 60 * 1000);
    }

    schema.methods.pickPlayer = async function (index) {
        const Player = this.model("Player");
        const picking = this.selected.length % 2;
        const selected = this.selected[index];
        const player = await Player.findById(selected);

        if (!selected) return null;

        this.players[selected] = {
            team: picking === 0 ? "A" : "B"
        }

        await player.discordMember.addRole(picking === 0 ? app.config.teams.A.role : app.config.teams.B.role);

        this.selected.splice(index, 1);
        this.markModified("players");
        this.markModified("selected");

        await this.save();

        return player;
    }

    schema.methods.checkEndResult = async function () {
        const Player = this.model("Player");

        if (app.config.game === "tf2") {
            if (app.config.logstf) {
                try {
                    log("Checking for logstf");
                    const res = await request(`http://logs.tf/api/v1/log?uploader=${app.config.logstf.uploader}&map=${this.map}`);
                    const body = JSON.parse(res.body);
                    const id = body.logs[0] ? body.logs[0].id : -1;
    
                    if (id !== -1)
                        this.prefs.logstf = id;
                } catch (error) {
                    log("Failed to check for logstf due to error", error)
                }
            }

            if (app.config.demostf) {
                try {
                    log("Checking for demostf");
                    const res = await request(`https://api.demos.tf/uploads/${app.config.demostf.uploader}?map=${this.map}`);
                    const body = JSON.parse(res.body);
                    const id = body[0] ? body[0].id : -1;
    
                    if (id !== -1)
                        this.prefs.demostf = id;
                } catch (error) {
                    log("Failed to check for demostf due to error", error)
                }
            }

            if (this.prefs.logstf) {
                try {
                    log("Checking for logstf results");

                    const res = await request(`http://logs.tf/api/v1/log/${this.prefs.logstf}`);
                    const body = JSON.parse(res.body);
                    
                    this.prefs.scores = {};
                    this.prefs.scores.team1 = body.teams.Blue.score;
                    this.prefs.scores.team2 = body.teams.Red.score;
                    
                    if (this.prefs.scores.team1 > this.prefs.scores.team2) {
                        this.prefs.winner = 0;
                    } else if (this.prefs.scores.team1 < this.prefs.scores.team2) {
                        this.prefs.winner = 1;
                    } else {
                        this.prefs.winner = -1;
                    }    
                } catch (error) {
                    log("Failed to check for logstf results due to error", error)
                }
            }
        }

        if (app.config.discord.channels.log) {
            try {
                log("Sending match result");
                const channel = app.config.discord.channels.log;
                const fields = [];
                const embed = {
                    color: 0x00BCD4,
                    title: `Match Complete`,
                    fields
                }
                
                let teamA = "";    
                let teamB = "";
    
                for (let i in this.players) {
                    const player = await Player.findById(i);
                    const matchPlayer = this.players[i];

                    if (matchPlayer.team === "A") {
                        if (this.prefs.winner === 1)
                            teamA += `**${player.discordMember.user.tag}**\n`
                        else 
                            teamA += `${player.discordMember.user.tag}\n`
                    } else if (matchPlayer.team === "B") {
                        if (this.prefs.winner === 0)
                            teamB += `**${player.discordMember.user.tag}**\n`
                        else 
                            teamB += `${player.discordMember.user.tag}\n`
                    }
                }

                fields.push({
                    name: app.config.teams.A.name,
                    value: teamA,
                    inline: true
                });

                fields.push({
                    name: app.config.teams.B.name,
                    value: teamB,
                    inline: true
                });

                fields.push({
                    name: 'Format',
                    value: this.format
                });
    
                fields.push({
                    name: 'Map',
                    value: this.map,
                    inline: true
                });
    
                if (app.config.game === "tf2") {
                    if (this.prefs.logstf) {
                        fields.push({
                            name: 'Logs.tf',
                            value: `http://logs.tf/${this.prefs.logstf}`
                        });
                    }
    
                    if (this.prefs.demostf) {
                        fields.push({
                            name: 'Demos.tf',
                            value: `https://demos.tf/${this.prefs.demostf}`
                        });
                    }
                }
                
                await app.discord.sendToChannel(channel, { embed });
            } catch (error) {
                log("Failed to send match result due to error", error);
            }
        }

        this.markModified("prefs");
        await this.setStatus(statuses.ENDED);
    }

    schema.methods.sendMapVoteMenu = async function () {        
        const Server = this.model("Server");

        const format = app.config.formats[this.format];
        const server = await Server.findById(this.server);

        if (!this.prefs.mapVoteMsg && format.maps.length > 1) {
            const maps = format.maps;
            const fields = [];
            const embed = {
                color: 0x00BCD4,
                title: `Map Vote`,
                description: "React with the correct number to vote for the map",
                fields
            }
            let mapList = "";

            for (let i = 0; i < maps.length; i++) {
                mapList += `${list_index[i+1]}: ${maps[i]}\n`;
            }

            mapList += `${list_index[maps.length+1]}: Random Map`;

            fields.push({
                name: "MapList",
                value: mapList
            });

            const message = await server.sendDiscordMessage({
                embed,
                text: "@everyone"
            });

            this.prefs.mapVoteMsg = message.id;
            this.markModified("prefs");

            await this.save();

            let c = 0;

            while (c !== maps.length + 1) {
                await message.react(list_reactions[c]);

                c++;
            }

            setTimeout(() => {
                log("Checking map votes...");

                const reactions = message.reactions.array();
                let highestIndex = -1, highest = -1;

                for (let i in reactions) {
                    const reaction = reactions[i];
                    const index = list_reactions.indexOf(reaction.emoji.name);
                    
                    if (index != -1) {
                        if (reaction.count > highest) {
                            highest = reaction.count;
                            highestIndex = index;
                        }
                    }
                }

                if (highestIndex !== -1) {
                    if (highestIndex === maps.length);
                    else 
                        this.map = maps[highestIndex];
                }

                if (this.map) {
                    log(`Highest voted map ${this.map}`);
                } else {
                    log("Random map will be selected", highestIndex, highest);
                }

                this.setStatus(statuses.SETUP);
            }, 10 * 1000);
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

        if (!match.prefs.createdChannels) {
            try {
                await server.createDiscordChannels();     
                
                match.prefs.createdChannels = true;
                match.markModified("prefs");
    
                return await match.save();
            } catch (error) {
                log("Failed to create discord channels due to error", error);
            }
        }

        try {

            if (match.status === Match.status.PICKING) {
                server.discordRole.setName(`${server.name}: Picking`);
                await match.initPickPlayer();
            } else if (match.status === Match.status.MAPVOTING) {
                await match.sendMapVoteMenu();
            } else if (match.status === Match.status.SETUP) {
                if (!match.map) {
                    match.map = format.maps[Math.floor(Math.random() * format.maps.length)];
                
                    return await match.save();
                }
    
                server.discordRole.setName(`${server.name}: Setting Up`);
                await server.setStatus(Server.status.RESERVED);
                await server.moveDiscordPlayers();
                await server.commands.changeLevel(match.map);
                await server.save();
            } else if (match.status === Match.status.WAITING) {
                server.discordRole.setName(`${server.name}: Waiting (0/${format.size * 2})`);
                
                if (!interval[match.id.toString()]) {
                    interval[match.id.toString()] = setInterval(function () {
                        checkMatchStatus(match, interval);
                    }, 30000);
                }
    
                if (!match.prefs.announced) {
                    await server.sendDiscordMessage({                    
                        text: `@everyone Server is ready, join at\n
                        URL: steam://connect/${server.ip}:${server.port}\n
                        Console: connect ${server.ip}:${server.port}\n
                        IP: ${server.ip}:${server.port}`,
                    });
    
                    await server.sendDiscordMessage({ 
                        embed: {
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
                        }
                    });
    
                    match.prefs.announced = true;
                    match.markModified("prefs");
    
                    await match.save();
                }
            } else if (match.status === Match.status.KNIFE) {
                server.discordRole.setName(`${server.name}: Knife Round`);
                if (interval[match.id.toString()]) {
                    clearInterval(interval[match.id.toString()]);
                    interval[match.id.toString()] = null;
                }
            }  else if (match.status === Match.status.VOTING) {
                server.discordRole.setName(`${server.name}: Voting`);
            } else if (match.status === Match.status.LIVE) {
                server.discordRole.setName(`${server.name}: Live`);
                if (interval[match.id.toString()]) {
                    clearInterval(interval[match.id.toString()]);
                    interval[match.id.toString()] = null;
                }
            } else if (match.status === Match.status.POSTMATCH) {
                server.discordRole.setName(`${server.name}: Ended`);      
                
                await sleep(5 * 1000);
    
                for (let i in match.players) {
                    const player = await Player.findById(i);
    
                    player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 
                    player.discordMember.removeRole(server.role);
                    player.discordMember.removeRole(app.config.teams.A.role);
                    player.discordMember.removeRole(app.config.teams.B.role);
                }
    
                // await sleep(30 * 1000);
                log("Checking for match results");
                await match.checkEndResult();
            }  else if (match.status === Match.status.ENDED) {
                await server.setStatus(Server.status.FREE);  
                await server.commands.changeLevel(match.map);
            } else if (match.status === Match.status.ERROR) {     
                for (let i in match.players) {
                    const player = await Player.findById(i);
    
                    player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 
                    player.discordMember.removeRole(server.role);
                    player.discordMember.removeRole(app.config.teams.A.role);
                    player.discordMember.removeRole(app.config.teams.B.role);
                }
    
                await sleep(30 * 1000);  
                await server.setStatus(Server.status.FREE);  
            }  else if (match.status === Match.status.CANCELED) {     
                for (let i in match.players) {
                    const player = await Player.findById(i);
    
                    player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 
                    player.discordMember.removeRole(server.role);
                    player.discordMember.removeRole(app.config.teams.A.role);
                    player.discordMember.removeRole(app.config.teams.B.role);
                }
    
                await sleep(30 * 1000);
                await server.setStatus(Server.status.FREE);  
            } else {   
                await match.setStatus(Match.status.ERROR);  
            }
        } catch (error) {
            log(`Failed to execute match status ${match.status} due to error`, error);
        }
    });

    async function checkMatchStatus(instance, interval) {
        const Server = instance.model("Server");
        const Match = instance.model("Match");

        const match = await Match.findById(instance);
        const server = await Server.findById(match.server);
        const config = match.getConfig();
        const format = config.formats[match.format];
        const num = await server.getNumberOfPlayers();
        const cooldown = (app.config.prefs.matchCancelCooldown || 15) * 60 * 1000;

        log(`Checking match cooldown ${(new Date) - match.matchStartTime} / ${cooldown}`);

        if (match.status === statuses.WAITING)
            server.discordRole.setName(`${server.name}: Waiting (${num < 0 ? 0 : num}/${format.size * 2})`);
        else if (match.status === statuses.LIVE) {
            if (interval[match.id.toString()]) {
                clearInterval(interval[match.id.toString()]);
                interval[match.id.toString()] = null;
            }
        
            log("Removed match cooldown check since match is live");
        }

        if (((new Date) - match.matchStartTime) > cooldown) {
            if (match.status === statuses.WAITING && num < format.size * 2) {
                log(`Match ${match.id} has gone past cooldown and only (${num} / ${format.size * 2}) players joined. So the match will be cancelled.`);

                await match.setStatus(statuses.CANCELED);
            }

            if (interval[match.id.toString()]) {
                clearInterval(interval[match.id.toString()]);
                interval[match.id.toString()] = null;
            }
        }
    }
};