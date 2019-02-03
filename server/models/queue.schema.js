const mongoose = require('mongoose');

module.exports = {
    name: "Queue",
    plugins: {
        "@abskmj/mongoose-plugin-timestamps": true,
        events: true,
        "discord.channel": true,
        "discord.role": true,
        "discord.guild": true
    },
    schema: {
        name: String,
        channel: String,
        format: String,
        role: String,
        map: String,
        players: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Player"
        }]
    },
    options: {
        versionKey: false
    }
}
