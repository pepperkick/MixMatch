const mongoose = require('mongoose');

module.exports = {
    name: "Match",
    plugins: {
        "@abskmj/mongoose-plugin-timestamps": true,
        events: true,
        config: true
    },
    schema: {
        players: {
            type: Object
        },
        selected: {
            type: Object
        },
        server: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Server"
        },
        format: String,
        map: String,
        stats: Object
    },
    options: {
        versionKey: false
    }
}
