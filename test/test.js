const assert = require("assert");
const mongoose = require('mongoose');
const Discord = require('discord.js');
const mongen = require('@abskmj/mongen');
const request = require('async-request');
const args = require('optimist').argv;
const Rcon = require("rcon-client").Rcon;

const env = process.env.NODE_ENV;

let config

if (env) {
    const path = `../config.${env}.json`;
    config = require(path);
} else {
    config = require('../config.json');
}

const config_test = require("./config.json");

describe("Configuration", function () {
    afterEach(function () {
        if (this.currentTest.state === 'failed') {
            process.emit();
        }
    });

    it("should have connection config", async function () {
        assert(config.connection, "Connection config is not defined");
    });

    it("should have discord config", async function () {
        assert(config.discord, "Discord config is not defined");
        assert(config.discord.token, "Discord token is not defined");
        assert(config.discord.guild, "Discord guild is not defined");
        assert(config.discord.client_id, "Discord app client id is not defined");
        assert(config.discord.client_secret, "Discord app client secret is not defined");

        assert(config.discord.roles.admin, "Admin role id is not defined");
        assert(config.discord.roles.player, "Player role id is not defined");
        // assert(config.discord.roles.captain);
    });

    it("should have formats config", async function () {
        assert(config.formats, "Format config does not exist");
        assert(config.formats instanceof Object, "Format config must be an object");
        assert(Object.keys(config.formats).length > 0, "No format configs are present");
    
        for (const name in config.formats) {
            const format = config.formats[name];
    
            assert(format.size, `Size for format ${name} is not defined`);
        }
    });

    it("should have Queues config", async function () {
        assert(config.queues, "Queue config does not exist");
        assert(config.queues instanceof Object, "Queue config must be an object");
        assert(Object.keys(config.queues).length > 0, "No Queue configs are present");

        for (const name in config.queues) {
            const queue = config.queues[name];
    
            assert(queue.channel, `Channel id for Queue ${name} is not defined`);
            assert(queue.formats, `Game formats for Queue ${name} is not defined`);
            assert(queue.ip, `IP for Queue ${name} is not defined`);
            assert(queue.port, `Port for Queue ${name} is not defined`);
            assert(queue.rcon, `RCON password for Queue ${name} is not defined`);
            assert(queue.role, `Discord role for Queue ${name} is not defined`);

            assert(typeof queue.ip === 'string', `IP for Queue ${name} must be a String`);
            assert(typeof queue.ip === 'string' || isNum(queue.port), `Port for Queue ${name} must be a String or Number`);
            assert(typeof queue.ip === 'string', `RCON password for Queue ${name} must be a String`);

            assert(isValidIp(queue.ip), `Queue IP ${queue.ip} is not valid`);

            for (const i in queue.formats) {
                assert(config.formats[queue.formats[i]], `Format ${queue.formats[i]} does not exist`);
            }
        }
    });
    
    it("should have teams config", async function () {
        assert(config.teams, "Teams config is not defined");
        assert(config.teams.A, "Team A config is not defined");
        assert(config.teams.A.name, "Team A name is not defined");
        assert(config.teams.A.role, "Team A role is not defined");
        assert(config.teams.B, "Team A config is not defined");
        assert(config.teams.B.name, "Team B name is not defined");
        assert(config.teams.B.role, "Team B role is not defined");
    });
});

describe("Discord", function () {
    afterEach(function () {
        if (this.currentTest.state === 'failed') {
            if (this.isFailed) process.emit();
        }
    });

    after(async function () {
        this.timeout(10000);
        await this.bot.destroy();
    });

    it("should login", async function () {
        this.timeout(10000);

        try {
            const bot = new Discord.Client();
            await bot.login(config.discord.token);

            if (bot.user.id !== config_test.bot_id) {
                assert.fail(`Bot user id (${bot.user.id}) does not match with supplied test config id (${config_test.bot_id})`);

                process.emit();
            }

            this.bot = bot;
        } catch (error) {
            assert.fail(error);

            await this.bot.destroy();

            this.isFailed = true;
        }
    });

    it("should be in guild", async function () {
        const guild = await this.bot.guilds.get(config.discord.guild);

        assert(guild, `Bot not present in guild ${config.discord.guild}`);

        if (guild) this.guild = guild;
    });
    
    it('should have channels for queues', async function () {
        for (const name in config.Queues) {            
            const Queue = config.Queues[name];
            const Queue_channel = Queue.channel;
            const channel = await this.guild.channels.get(Queue_channel);
    
            assert(channel, `Queue channel for ${Queue.name} not present in guild ${config.discord.guild}`);
        }
    });
    
    it('should have roles', async function () {
        const role_admin = await this.guild.roles.get(config.discord.roles.admin);
        const role_player = await this.guild.roles.get(config.discord.roles.player);
        // const role_captain = await this.guild.roles.get(config.discord.roles.captain);

        assert(role_admin, "Admin role does not exist in guild");
        assert(role_player, "Player role does not exist in guild");
        // assert(role_captain, "Captain role does not exist in guild");
    });

    it('should have roles for queues', async function () {
        for (const name in config.Queues) {        
            const queue = config.Queues[name];
            const queue_role = queue.role;
            const role = await this.guild.roles.get(queue_role);
    
            assert(role.id === config.queue[name].role, `Queue role for ${queue.name} not present in guild ${config.discord.guild}`);
        }
    });

    it('should have roles for teams', async function () {
        const roleA = await this.guild.roles.get(config.teams.A.role);
        const roleB = await this.guild.roles.get(config.teams.B.role);

        assert(roleA, `Team A role is not present in guild ${config.discord.guild}`);
        assert(roleB, `Team B role is not present in guild ${config.discord.guild}`);
    });
});

describe("Database", async function () {
    afterEach(function () {
        if (this.currentTest.state === 'failed') {
            if (this.isFailed) process.emit();
        }
    });
    
    after(async function () {
        if (this.player1) await this.player1.delete();
        if (this.player2) await this.player2.delete();
        if (this.queue) await this.queue.delete();
        await this.connection.disconnect();
    });

    it("should connect", async function () {
        this.timeout(10000);

        try {
            let connection = await mongoose.connect(
                config.connection, { useNewUrlParser: true });
            mongen.init(connection, __dirname + '/../server/models');
            
            this.Player = connection.model("Player");
            this.Queue = connection.model("Queue");
    
            assert(this.Player, "Player model did not register");
            assert(this.Queue, "Queue model did not register");

            this.connection = connection;
        } catch (error) {
            assert.fail(error);

            this.isFailed = true;
        }
    });

    it("should create players", async function () {        
        this.player1 = new this.Player({
            discord: "1234",
            steam: "5678"
        });
        this.player2 = new this.Player({
            discord: "4321",
            steam: "8765"
        });
        
        try {
            await this.player1.save();
            await this.player2.save();

            assert(this.player1.status === this.Player.status.FREE && this.player2.status === this.Player.status.FREE, "Player status value did not set to FREE");
        } catch (error) {
            assert.fail(error);
        }
    });

    it("should find players", async function () {
        const player1 = await this.Player.findByDiscord("1234");
        const player2 = await this.Player.findBySteam("8765");

        assert(player1 && player1.discord === "1234", "Could not find player from 'findByDiscord' function");
        assert(player2 && player2.steam === "8765", "Could not find player from 'findBySteam' function");
    });

    it("should return player object from player id", async function () {
        const player_obj1 = await this.Player.checkOrGet(this.player1);
        const player_obj2 = await this.Player.checkOrGet(this.player1.id);

        assert(player_obj1, "'checkOrGet' failed to get the object from object");
        assert(player_obj2, "'checkOrGet' failed to get the object from string id");
    });

    it("should create queues", async function () {
        this.queue = new this.Queue({
            name: "TEST",
            ip: "1.1.1.1",
            port: 80,
            format: "6v6",
            rcon: "test123",
            channel: "12345"
        });

        try {
            await this.queue.save();

            assert(this.queue.status === this.Queue.status.UNKNOWN, "Queue status value did not set to UNKNOWN");
            assert(!this.queue.isFree(), "'isFree' function did not return false");
            
            await this.queue.setStatus(this.Queue.status.FREE);

            assert(this.queue.status === this.Queue.status.FREE, "Queue status value did not set to FREE");
            assert(this.queue.isFree(), "'isFree' function did not return true");
        } catch (error) {
            assert.fail(error);
        }
    });

    it("should find queues", async function () {
        const queue_obj1 = await this.Queue.findByName("TEST");
        const queue_obj2 = await this.Queue.findByIp("1.1.1.1", 80);

        assert(queue_obj1, "Failed to get Queue from 'findByName' function");
        assert(queue_obj2, "Failed to get Queue from 'findByIp' function");
    });

    // it("should put player in Queue", async function () {
    //     try {
    //         await this.Queue.addPlayer(this.player1);

    //         assert(this.Queue.players.length === 1, "Players array length did not set to 1");
    //         assert(this.player1.status === this.Player.status.JOINED, "Player's status was not set to JOINED");
    //         assert(this.player1.Queue == this.Queue.id, "Player's Queue was not set to Queue id");

    //         await this.Queue.addPlayer(this.player1);

    //         assert(this.Queue.players.length === 1, "Players array length changed from 1");

    //         await this.Queue.addPlayer(this.player2);

    //         assert(this.Queue.players.length === 2, "Players array length did not set to 2");
    //         assert(this.player2.status === this.Player.status.JOINED, "Player's status was not set to JOINED");
    //         assert(this.player2.Queue == this.Queue.id, "Player's Queue was not set to Queue id");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });
    
    // it("should remove player from Queue", async function () {
    //     try {
    //         await this.Queue.removePlayer(this.player2);

    //         assert(this.Queue.players.length === 1, "Players array length did not set to 1");
    //         assert(this.player2.status === this.Player.status.FREE, "Player's status was not set to FREE");
    //         assert(this.player2.Queue == null, "Player's Queue was not set to null");

    //         await this.Queue.removePlayer(this.player2);
            
    //         assert(this.Queue.players.length === 1, "Players array length changed from 1");

    //         await this.Queue.removePlayer(this.player1);

    //         assert(this.Queue.players.length === 0, "Players array length did not set to 0");
    //         assert(this.player1.status === this.Player.status.FREE, "Player's status was not set to FREE");
    //         assert(this.player1.Queue == null, "Player's Queue was not set to null");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });
    
    // it("should reset Queue", async function () {
    //     try {
    //         await this.Queue.addPlayer(this.player1);
    //         await this.Queue.addPlayer(this.player2);
            
    //         assert(this.Queue.players.length === 2, "Players array length did not set to 2");

    //         await this.Queue.reset();

    //         assert(this.Queue.players.length === 0, "Players array length did not set to 0");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });

    // it("should change Queue format", async function () {
    //     try {
    //         await this.Queue.changeFormat("6v6");

    //         assert(this.Queue.format === "6v6", "Queue format did not set to 6v6");

    //         await this.Queue.addPlayer(this.player1);
    //         await this.Queue.changeFormat("4v4");

    //         assert(this.Queue.format === "6v6", "Queue format changed from 6v6");

    //         await this.Queue.reset();
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });

    // it("should change Queue status to setup", async function () {
    //     try {
    //         await this.Queue.addPlayer(this.player1);
    //         await this.Queue.addPlayer(this.player2);

    //         if (Queue.players.length >= 1 * 2) {
    //             Queue.status = Queue.status.SETUP;

    //             await Queue.save();
    //         }

    //         assert(this.Queue.status === this.Queue.status.SETUP, "Player's status was not set to SETUP");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });
});

describe("RCON", async function () {
    before(async function () {
        this.conns = {};
    });

    after(async function () {
        this.timeout(10000);

        delete this.conns;
    });

    it("should connect to queues", async function () {
        this.timeout(5000);

        for (const name in config.queues) {
            try {
                const queue = config.queues[name];
                const rcon = new Rcon({packetResponseTimeout: 1000});
                
                await rcon.connect({ host: queue.ip, port: queue.port, password: queue.rcon });

                this.conns[name] = rcon;
            } catch (error) {
                assert.fail(error);
            }
        }
    });

    it("should get response from Queue plugin", async function () {
        for (const name in config.Queues) {
            try {            
                const version = await this.conns[name].send("mx_version");

                assert(version, "Could not get response from plugin in Queue ${name}");
                assert(version.includes(config.plugin.version), `Plugin in Queue ${name} is outdated`);
            } catch (error) {
                assert.fail(error);
            }
        }
    });

    it("should have required maps in Queue", async function () {
        this.timeout(30000);

        for (const name in config.Queues) {
            try {            
                const formats = config.Queues[name].formats;

                for (const i in formats) {
                    const format = config.Queues[name].formats[i];
                    const format_cfg = config.formats[config.Queues[name].formats[i]];
                    const maps = format_cfg.maps;

                    for (const j in maps) {
                        const map = maps[j];
                        const result = await this.conns[name].send(`maps ${map}`);

                        assert(result.includes(map), `Could not find map '${map}' in Queue ${name} for format ${config.Queues[name].formats[i]}`);
                    }
                }
            } catch (error) {
                assert.fail(error);
            }
        }
    });
});

describe('Application', function () { 
    this.timeout(10000);

    before(async function () {
        if (!args.g) process.exit();  
    });

    after(async function () {
        process.exit();  
    });

    it("should not cause any exception", async function () {
        try {
            this.app = await require("../server/app").init();

            const Queue = await this.app.connection.model("Queue");
            const Player = await this.app.connection.model("Player");
            
            this.Queue = new Queue({
                name: "test",
                ip: "1.1.1.1",
                port: 20,
                rcon: "test123",
                channel: "123",
                role: "123",
                format: "Test"
            });

            await this.Queue.save();
            await this.Queue.delete();
            
            this.player = new Player({
                discord: "1234",
                steam: "5678"
            });

            await this.player.save();
            await this.player.delete();
        } catch (error) {
            assert.fail(error);
        }
    });
});

describe('API', function () { 
    this.timeout(10000);

    before(async function () {
        if (!args.g) process.exit();
        this.app = await require("../server/app").init();        
    });

    after(async function () {
        if (this.Queue) await this.Queue.delete();
        process.exit(0);        
    });

    it("should respond ok for Queue status call", async function () {
        try {
            const Queue = await this.app.connection.model("Queue");
            
            this.Queue = new Queue({
                name: "test",
                ip: "1.1.1.1",
                port: 20,
                rcon: "test123",
                channel: "123",
                role: "123",
                format: "Test"
            });

            await this.Queue.save();

            const response = await request(`http://${config.host}:${config.port}/plugin/status_change?name=${this.Queue.name}&status=FREE`);

            assert(response.statusCode === 200, `Set status API call failed with status code ${response.statusCode}`);
        } catch (error) {
            assert.fail(error);
        }
    });
});

const isValidIp = value => (/^(?:(?:^|\.)(?:2(?:5[0-5]|[0-4]\d)|1?\d?\d)){4}$/.test(value) ? true : false);
const isNum = value => typeof value === "number" && Number.isInteger(value);