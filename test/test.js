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

    it("should have servers config", async function () {
        assert(config.servers, "Server config does not exist");
        assert(config.servers instanceof Object, "Server config must be an object");
        assert(Object.keys(config.servers).length > 0, "No server configs are present");

        for (const name in config.servers) {
            const server = config.servers[name];
    
            assert(server.channel, `Channel id for server ${name} is not defined`);
            assert(server.formats, `Game formats for server ${name} is not defined`);
            assert(server.ip, `IP for server ${name} is not defined`);
            assert(server.port, `Port for server ${name} is not defined`);
            assert(server.rcon, `RCON password for server ${name} is not defined`);
            assert(server.role, `Discord role for server ${name} is not defined`);

            assert(typeof server.ip === 'string', `IP for server ${name} must be a String`);
            assert(typeof server.ip === 'string' || isNum(server.port), `Port for server ${name} must be a String or Number`);
            assert(typeof server.ip === 'string', `RCON password for server ${name} must be a String`);

            assert(isValidIp(server.ip), `Server IP ${server.ip} is not valid`);

            for (const i in server.formats) {
                assert(config.formats[server.formats[i]], `Format ${server.formats[i]} does not exist`);
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
    
    it('should have channels for servers', async function () {
        for (const name in config.servers) {            
            const server = config.servers[name];
            const server_channel = server.channel;
            const channel = await this.guild.channels.get(server_channel);
    
            assert(channel, `Server channel for ${server.name} not present in guild ${config.discord.guild}`);
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

    it('should have roles for servers', async function () {
        for (const name in config.servers) {            
            const server = config.servers[name];
            const server_role = server.role;
            const role = await this.guild.roles.get(server_role);
    
            assert(role, `Server role for ${server.name} not present in guild ${config.discord.guild}`);
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
        if (this.server) await this.server.delete();
        await this.connection.disconnect();
    });

    it("should connect", async function () {
        this.timeout(10000);

        try {
            let connection = await mongoose.connect(
                config.connection, { useNewUrlParser: true });
            mongen.init(connection, __dirname + '/../server/models');
            
            this.Player = connection.model("Player");
            this.Server = connection.model("Server");
    
            assert(this.Player, "Player model did not register");
            assert(this.Server, "Server model did not register");

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

    it("should create servers", async function () {
        this.server = new this.Server({
            name: "TEST",
            ip: "1.1.1.1",
            port: 80,
            format: "6v6",
            rcon: "test123",
            channel: "12345"
        });

        try {
            await this.server.save();

            assert(this.server.status === this.Server.status.UNKNOWN, "Server status value did not set to UNKNOWN");
            assert(!this.server.isFree(), "'isFree' function did not return false");
            
            await this.server.setStatus(this.Server.status.FREE);

            assert(this.server.status === this.Server.status.FREE, "Server status value did not set to FREE");
            assert(this.server.isFree(), "'isFree' function did not return true");
        } catch (error) {
            assert.fail(error);
        }
    });

    it("should find servers", async function () {
        const server_obj1 = await this.Server.findByName("TEST");
        const server_obj2 = await this.Server.findByIp("1.1.1.1", 80);

        assert(server_obj1, "Failed to get server from 'findByName' function");
        assert(server_obj2, "Failed to get server from 'findByIp' function");
    });

    // it("should put player in server", async function () {
    //     try {
    //         await this.server.addPlayer(this.player1);

    //         assert(this.server.players.length === 1, "Players array length did not set to 1");
    //         assert(this.player1.status === this.Player.status.JOINED, "Player's status was not set to JOINED");
    //         assert(this.player1.server == this.server.id, "Player's server was not set to server id");

    //         await this.server.addPlayer(this.player1);

    //         assert(this.server.players.length === 1, "Players array length changed from 1");

    //         await this.server.addPlayer(this.player2);

    //         assert(this.server.players.length === 2, "Players array length did not set to 2");
    //         assert(this.player2.status === this.Player.status.JOINED, "Player's status was not set to JOINED");
    //         assert(this.player2.server == this.server.id, "Player's server was not set to server id");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });
    
    // it("should remove player from server", async function () {
    //     try {
    //         await this.server.removePlayer(this.player2);

    //         assert(this.server.players.length === 1, "Players array length did not set to 1");
    //         assert(this.player2.status === this.Player.status.FREE, "Player's status was not set to FREE");
    //         assert(this.player2.server == null, "Player's server was not set to null");

    //         await this.server.removePlayer(this.player2);
            
    //         assert(this.server.players.length === 1, "Players array length changed from 1");

    //         await this.server.removePlayer(this.player1);

    //         assert(this.server.players.length === 0, "Players array length did not set to 0");
    //         assert(this.player1.status === this.Player.status.FREE, "Player's status was not set to FREE");
    //         assert(this.player1.server == null, "Player's server was not set to null");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });
    
    // it("should reset server", async function () {
    //     try {
    //         await this.server.addPlayer(this.player1);
    //         await this.server.addPlayer(this.player2);
            
    //         assert(this.server.players.length === 2, "Players array length did not set to 2");

    //         await this.server.removeAllPlayers();

    //         assert(this.server.players.length === 0, "Players array length did not set to 0");
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });

    // it("should change server format", async function () {
    //     try {
    //         await this.server.changeFormat("6v6");

    //         assert(this.server.format === "6v6", "Server format did not set to 6v6");

    //         await this.server.addPlayer(this.player1);
    //         await this.server.changeFormat("4v4");

    //         assert(this.server.format === "6v6", "Server format changed from 6v6");

    //         await this.server.removeAllPlayers();
    //     } catch (error) {
    //         if (error.code) {
    //             if (error.code === "ERR_ASSERTION") 
    //                 throw error;
    //         } else {
    //             assert.fail(error);
    //         }
    //     }
    // });

    // it("should change server status to setup", async function () {
    //     try {
    //         await this.server.addPlayer(this.player1);
    //         await this.server.addPlayer(this.player2);

    //         if (server.players.length >= 1 * 2) {
    //             server.status = Server.status.SETUP;

    //             await server.save();
    //         }

    //         assert(this.server.status === this.Server.status.SETUP, "Player's status was not set to SETUP");
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

    it("should connect to servers", async function () {
        this.timeout(5000);

        for (const name in config.servers) {
            try {
                const server = config.servers[name];
                const rcon = new Rcon({packetResponseTimeout: 1000});
                
                await rcon.connect({ host: server.ip, port: server.port, password: server.rcon });

                this.conns[name] = rcon;
            } catch (error) {
                assert.fail(error);
            }
        }
    });

    it("should get response from server plugin", async function () {
        for (const name in config.servers) {
            try {            
                const version = await this.conns[name].send("mx_version");

                assert(version, "Could not get response from plugin in server ${name}");
                assert(version.includes(config.plugin.version), `Plugin in server ${name} is outdated`);
            } catch (error) {
                assert.fail(error);
            }
        }
    });

    it("should have required maps in server", async function () {
        this.timeout(30000);

        for (const name in config.servers) {
            try {            
                const formats = config.servers[name].formats;

                for (const i in formats) {
                    const format = config.servers[name].formats[i];
                    const format_cfg = config.formats[config.servers[name].formats[i]];
                    const maps = format_cfg.maps;

                    for (const j in maps) {
                        const map = maps[j];
                        const result = await this.conns[name].send(`maps ${map}`);

                        assert(result.includes(map), `Could not find map '${map}' in server ${name} for format ${config.servers[name].formats[i]}`);
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

            const Server = await this.app.connection.model("Server");
            const Player = await this.app.connection.model("Player");
            
            this.server = new Server({
                name: "test",
                ip: "1.1.1.1",
                port: 20,
                rcon: "test123",
                channel: "123",
                role: "123",
                format: "Test"
            });

            await this.server.save();
            await this.server.delete();
            
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
        if (this.server) await this.server.delete();
        process.exit(0);        
    });

    it("should respond ok for server status call", async function () {
        try {
            const Server = await this.app.connection.model("Server");
            
            this.server = new Server({
                name: "test",
                ip: "1.1.1.1",
                port: 20,
                rcon: "test123",
                channel: "123",
                role: "123",
                format: "Test"
            });

            await this.server.save();

            const response = await request(`http://${config.host}:${config.port}/plugin/status_change?name=${this.server.name}&status=free`);

            assert(response.statusCode === 200, `Set status API call failed with status code ${response.statusCode}`);
        } catch (error) {
            assert.fail(error);
        }
    });
});

const isValidIp = value => (/^(?:(?:^|\.)(?:2(?:5[0-5]|[0-4]\d)|1?\d?\d)){4}$/.test(value) ? true : false);
const isNum = value => typeof value === "number" && Number.isInteger(value);