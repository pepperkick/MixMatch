const mongoose = require('mongoose');

module.exports = {
    name: "Server",
    plugins: {
        "@abskmj/mongoose-plugin-timestamps": true,
        events: true,
        "discord.channel": true,
        "discord.role": true,
        "discord.guild": true,
        rcon: true,
        config: true
    },
    schema: {
        name: String,
        ip: String,
        port: String,
        rcon: String,
        channel: String,
        format: String,
        role: String,
        map: String
    },
    options: {
        versionKey: false
    }
}
