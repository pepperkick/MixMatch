module.exports = (schema, options) => {  
    schema.methods.commands = function () {
        return {
            kick: kick.bind(this),
            changeLevel: changeLevel.bind(this),
            console: { 
                kick: conKick.bind(this), 
                changeLevel: conChangeLevel.bind(this),
                addHttpLogListener: conAddHttpLogListener.bind(this)
            },
            sourcemod: { 
                kick: smKick.bind(this)
            },
            plugin: {
                addPlayer: pluginAddPlayer.bind(this)
            }
        }
    };
    
    schema.methods.hasSourcemod = async function () {
        const res = await this.rconConn.send("sm version");

        if (res.includes("Unknown command")) return false;

        return true;
    }

    schema.methods.hasSourcemodPlugin = async function (plugin) {
        if (await this.hasSourcemod());
        else return false;

        const res = await this.rconConn.send(`sm plugins info ${plugin}`);

        if (res.includes("is not loaded")) return false;

        return true;
    }

    async function kick(client, reason = "Kicked by Console") {
        if (await this.hasSourcemodPlugin("basecommands")) {
            return this.commands.sourcemod.kick(client, reason);
        } else {
            return this.commands.console.kick(client, reason);
        }
    }

    async function changeLevel(map) {
        return this.commands.console.changeLevel(map);
    };

    async function smKick(client, reason = "Kicked by Console") {
        return this.rconConn.send(`sm_kick #${client} ${reason}`);
    };

    async function conKick(client, reason = "Kicked by Console") {
        return this.rconConn.send(`kick_ex #${client} ${reason}`);
    };

    async function conChangeLevel(map) {
        return this.rconConn.send(`changelevel ${map}`);
    };

    async function conAddHttpLogListener(url) {
        return this.rconConn.send(`logaddress_add_http "${url}"`);
    };

    async function pluginAddPlayer(steam, team, name) {
        if (await this.hasSourcemodPlugin("mixmatch")) {
            return this.rconConn.send(`mx_add_player ${steam} ${team} "${name}"`);
        }
    }
}