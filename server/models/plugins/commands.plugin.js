module.exports = (schema, options) => {  
    schema.methods.sourcemod = {};
    schema.methods.sourcemod.kick = async function (client, reason = "Kicked by Console") {
        await this.rconConn.send(`sm_kick #${client} ${reason}`);
    };
}