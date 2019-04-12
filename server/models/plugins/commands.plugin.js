module.exports = (schema, options) => {  
    schema.virtual("commands").get(function () {
        return {
            changeLevel: changeLevel.bind(this),
            kick: kick.bind(this),
            status: status.bind(this),
            announce: announce.bind(this),
            console: { 
                addHttpLogListener: conAddHttpLogListener.bind(this),
                addLogListener: conAddLogListener.bind(this),
                changeLevel: conChangeLevel.bind(this),
                kick: conKick.bind(this), 
                status: conStatus.bind(this),
            },
            sourcemod: { 
                kick: smKick.bind(this)
            },
            plugin: {
                addPlayer: pluginAddPlayer.bind(this)
            }
        }
    });
    
    schema.methods.hasSourcemod = async function () {
        const res = await this.sendCommand("sm version");

        if (!res || res.includes("Unknown command")) return false;

        return true;
    }

    schema.methods.hasSourcemodPlugin = async function (plugin) {
        if (await this.hasSourcemod());
        else return false;

        const res = await this.sendCommand(`sm plugins info ${plugin}`);

        if (!res || res.includes("is not loaded")) return false;

        return true;
    }

    schema.methods.hasPluginVar = async function (cvar) {
        if (await this.hasSourcemod());
        else return false;

        const res = await this.sendCommand(cvar);

        if (!res || res.includes("Unknown")) return false;

        return true;
    }

    async function changeLevel(map) {
        return this.commands.console.changeLevel(map);
    };

    async function kick(client, reason = "Kicked by Console") {
        if (await this.hasSourcemodPlugin("basecommands")) {
            return this.commands.sourcemod.kick(client, reason);
        } else {
            return this.commands.console.kick(client, reason);
        }
    };

    async function status() {
        return this.commands.console.status();
    };

    async function announce(to, message) {
        if (await this.hasSourcemod()) {  
            if (await this.hasSourcemodPlugin("mixmatch")) {
                if (to === "all") {
                    return this.sendCommand(`mx_send_player_chat_all "${message}"`);
                } else if (to === "t") {
                    return this.sendCommand(`mx_send_player_chat_team 2 "${message}"`);
                } else if (to === "ct") {
                    return this.sendCommand(`mx_send_player_chat_team 3 "${message}"`);
                } else {
                    return this.sendCommand(`mx_send_player_chat ${to} "${message}"`);
                }
            } else {
                if (to === "all") {
                    return this.sendCommand(`sm_csay ${message}`);
                } else if (to === "t") {
                    return this.sendCommand(`sm_psay @t ${message}`);
                } else if (to === "ct") {
                    return this.sendCommand(`sm_psay @ct ${message}`);
                } else {
                    return this.sendCommand(`sm_psay ${to} ${message}`);
                }
            }
        } else {
            return this.sendCommand(`say ${to} ${message}`);
        }
    };

    async function smKick(client, reason = "Kicked by Console") {
        return this.sendCommand(`sm_kick #${client} ${reason}`);
    };

    async function conAddHttpLogListener(url) {
        return this.sendCommand(`logaddress_add_http "${url}"`);
    };

    async function conAddLogListener(url) {
        return this.sendCommand(`logaddress_add ${url}`);
    };

    async function conChangeLevel(map) {
        return this.sendCommand(`changelevel ${map}`);
    };

    async function conKick(client, reason = "Kicked by Console") {
        return this.sendCommand(`kick_ex #${client} ${reason}`);
    };

    async function conStatus() {
        return this.sendCommand(`status`);
    }

    async function pluginAddPlayer(steam, team, name) {
        if (this.hasPluginVar("mixmatch_version"))
            return this.sendCommand(`mx_add_player ${steam} ${team} "${name}"`);
    }
}